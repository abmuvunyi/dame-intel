import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { UsersService } from '../users/users.service';
import { PresenceService } from '../presence/presence.service';
import { Friendship } from './friendship.entity';
import { User } from '../users/user.entity';

// Real in-memory sqlite, same pattern as tournaments-swiss.service.spec.ts — this was
// previously just a "should be defined" stub with zero real coverage.
describe('FriendsService', () => {
  let service: FriendsService;
  let usersService: UsersService;
  let presenceService: PresenceService;

  async function makeUser(username: string) {
    return usersService.create(username, 'hash');
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Friendship, User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Friendship, User]),
      ],
      providers: [FriendsService, UsersService, PresenceService],
    }).compile();

    service = module.get<FriendsService>(FriendsService);
    usersService = module.get<UsersService>(UsersService);
    presenceService = module.get<PresenceService>(PresenceService);
  });

  describe('sending requests', () => {
    it('creates a PENDING request from sender to target', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');

      const req = await service.sendFriendRequest(alice.id, 'bob');
      expect(req.status).toBe('PENDING');

      const list = await service.getFriendsList(bob.id);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ friendId: alice.id, status: 'PENDING', isIncomingRequest: true });
    });

    it('rejects a request to a nonexistent user', async () => {
      const alice = await makeUser('alice');
      await expect(service.sendFriendRequest(alice.id, 'ghost')).rejects.toThrow(BadRequestException);
    });

    it('rejects adding yourself', async () => {
      const alice = await makeUser('alice');
      await expect(service.sendFriendRequest(alice.id, 'alice')).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate request (either direction)', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      await service.sendFriendRequest(alice.id, 'bob');

      await expect(service.sendFriendRequest(alice.id, 'bob')).rejects.toThrow(BadRequestException);
      await expect(service.sendFriendRequest(bob.id, 'alice')).rejects.toThrow(BadRequestException);
    });
  });

  describe('accepting requests', () => {
    it('flips a PENDING request to ACCEPTED when the recipient accepts', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const req = await service.sendFriendRequest(alice.id, 'bob');

      const accepted = await service.acceptFriendRequest(bob.id, req.id);
      expect(accepted.status).toBe('ACCEPTED');

      const aliceList = await service.getFriendsList(alice.id);
      const bobList = await service.getFriendsList(bob.id);
      expect(aliceList[0]).toMatchObject({ friendId: bob.id, status: 'ACCEPTED', isIncomingRequest: false });
      expect(bobList[0]).toMatchObject({ friendId: alice.id, status: 'ACCEPTED', isIncomingRequest: false });
    });

    it('refuses to let the sender accept their own outgoing request', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const req = await service.sendFriendRequest(alice.id, 'bob');

      await expect(service.acceptFriendRequest(alice.id, req.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('declining requests', () => {
    it('deletes the request outright, and lets a fresh request be sent afterward', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const req = await service.sendFriendRequest(alice.id, 'bob');

      const result = await service.declineFriendRequest(bob.id, req.id);
      expect(result.success).toBe(true);
      expect(await service.getFriendsList(bob.id)).toHaveLength(0);
      expect(await service.getFriendsList(alice.id)).toHaveLength(0);

      // "No" isn't forever — declining doesn't leave a permanent block behind.
      await expect(service.sendFriendRequest(alice.id, 'bob')).resolves.toBeDefined();
    });

    it('refuses to let the sender decline their own outgoing request', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const req = await service.sendFriendRequest(alice.id, 'bob');

      await expect(service.declineFriendRequest(alice.id, req.id)).rejects.toThrow(BadRequestException);
    });

    it('refuses to decline an already-accepted friendship', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const req = await service.sendFriendRequest(alice.id, 'bob');
      await service.acceptFriendRequest(bob.id, req.id);

      await expect(service.declineFriendRequest(bob.id, req.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('online status', () => {
    it('reflects PresenceService\'s live state for each friend', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const req = await service.sendFriendRequest(alice.id, 'bob');
      await service.acceptFriendRequest(bob.id, req.id);

      expect((await service.getFriendsList(alice.id))[0].online).toBe(false);

      presenceService.markOnline(bob.id);
      expect((await service.getFriendsList(alice.id))[0].online).toBe(true);

      presenceService.markOffline(bob.id);
      expect((await service.getFriendsList(alice.id))[0].online).toBe(false);
    });
  });
});
