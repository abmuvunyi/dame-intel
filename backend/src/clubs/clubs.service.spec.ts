import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { UsersService } from '../users/users.service';
import { Club } from './club.entity';
import { ClubMembership } from './club-membership.entity';
import { ClubPost } from './club-post.entity';
import { User } from '../users/user.entity';

// Real in-memory sqlite, same pattern used across the backend for anything with
// genuine relational queries worth exercising for real.
describe('ClubsService', () => {
  let service: ClubsService;
  let usersService: UsersService;

  async function makeUser(username: string) {
    return usersService.create(username, 'hash');
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Club, ClubMembership, ClubPost, User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Club, ClubMembership, ClubPost, User]),
      ],
      providers: [ClubsService, UsersService],
    }).compile();

    service = module.get<ClubsService>(ClubsService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('creating a club', () => {
    it('creates the club and automatically enrolls the creator as a member', async () => {
      const alice = await makeUser('alice');
      const club = await service.createClub(alice.id, 'Endgame Enthusiasts', 'For fans of the 3-vs-1 ending');

      expect(club.name).toBe('Endgame Enthusiasts');
      expect(await service.isMember(club.id, alice.id)).toBe(true);

      const members = await service.getClubMembers(club.id);
      expect(members).toHaveLength(1);
      expect(members[0].username).toBe('alice');
    });

    it('rejects a club with no name', async () => {
      const alice = await makeUser('alice');
      await expect(service.createClub(alice.id, '')).rejects.toThrow(BadRequestException);
    });
  });

  describe('joining and leaving', () => {
    it('lets a second user join, and reflects it in the member list and count', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');

      await service.joinClub(club.id, bob.id);

      const members = await service.getClubMembers(club.id);
      expect(members.map(m => m.username).sort()).toEqual(['alice', 'bob']);

      const fetched = await service.getClub(club.id);
      expect(fetched!.memberCount).toBe(2);
    });

    it('joining is idempotent — joining twice does not create two memberships', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');

      await service.joinClub(club.id, bob.id);
      await service.joinClub(club.id, bob.id);

      expect(await service.getClubMembers(club.id)).toHaveLength(2); // alice + bob, not 3
    });

    it('refuses to join a club that does not exist', async () => {
      const bob = await makeUser('bob');
      await expect(service.joinClub(999, bob.id)).rejects.toThrow(NotFoundException);
    });

    it('lets a member leave, and they are no longer counted as a member', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');
      await service.joinClub(club.id, bob.id);

      await service.leaveClub(club.id, bob.id);

      expect(await service.isMember(club.id, bob.id)).toBe(false);
      expect(await service.getClubMembers(club.id)).toHaveLength(1);
    });

    it('leaving a club you were never in is a harmless no-op', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');

      const result = await service.leaveClub(club.id, bob.id);
      expect(result.success).toBe(true);
    });
  });

  describe('discovering clubs', () => {
    it('getAllClubs lists every club with its member count', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      await service.createClub(alice.id, 'Club A');
      const clubB = await service.createClub(bob.id, 'Club B');
      await service.joinClub(clubB.id, alice.id);

      const all = await service.getAllClubs();
      expect(all).toHaveLength(2);
      const b = all.find(c => c.name === 'Club B')!;
      expect(b.memberCount).toBe(2);
    });

    it('getMyClubs only returns clubs the given user actually belongs to', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      await service.createClub(alice.id, 'Alice\'s Club');
      await service.createClub(bob.id, 'Bob\'s Club');

      const aliceClubs = await service.getMyClubs(alice.id);
      expect(aliceClubs).toHaveLength(1);
      expect(aliceClubs[0].name).toBe('Alice\'s Club');
    });
  });

  describe('club-only discussion feed', () => {
    it('lets a member post, and the post appears in the feed newest-first', async () => {
      const alice = await makeUser('alice');
      const club = await service.createClub(alice.id, 'Club');

      await service.postToClub(club.id, alice.id, 'First post');
      await service.postToClub(club.id, alice.id, 'Second post');

      const feed = await service.getClubFeed(club.id, alice.id);
      expect(feed.map(p => p.content)).toEqual(['Second post', 'First post']);
      expect(feed[0].author.username).toBe('alice');
    });

    it('refuses to let a non-member post', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');

      await expect(service.postToClub(club.id, bob.id, 'sneaky post')).rejects.toThrow(BadRequestException);
    });

    it('refuses to let a non-member read the feed', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');
      await service.postToClub(club.id, alice.id, 'members only');

      await expect(service.getClubFeed(club.id, bob.id)).rejects.toThrow(BadRequestException);
    });

    it('lets a member read the feed once they join, having been refused before', async () => {
      const alice = await makeUser('alice');
      const bob = await makeUser('bob');
      const club = await service.createClub(alice.id, 'Club');
      await service.postToClub(club.id, alice.id, 'members only');

      await expect(service.getClubFeed(club.id, bob.id)).rejects.toThrow(BadRequestException);
      await service.joinClub(club.id, bob.id);
      await expect(service.getClubFeed(club.id, bob.id)).resolves.toHaveLength(1);
    });

    it('applies the same profanity filter used for in-game chat to club posts', async () => {
      const alice = await makeUser('alice');
      const club = await service.createClub(alice.id, 'Club');

      await service.postToClub(club.id, alice.id, 'this game is shit honestly');
      const feed = await service.getClubFeed(club.id, alice.id);
      expect(feed[0].content).toBe('this game is **** honestly');
    });

    it('rejects an empty post', async () => {
      const alice = await makeUser('alice');
      const club = await service.createClub(alice.id, 'Club');
      await expect(service.postToClub(club.id, alice.id, '   ')).rejects.toThrow(BadRequestException);
    });
  });
});
