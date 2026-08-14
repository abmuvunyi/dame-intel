import { Test, TestingModule } from '@nestjs/testing';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { JwtService } from '@nestjs/jwt';

describe('FriendsController', () => {
  let controller: FriendsController;
  let service: { getFriendsList: jest.Mock, sendFriendRequest: jest.Mock, acceptFriendRequest: jest.Mock, declineFriendRequest: jest.Mock };

  beforeEach(async () => {
    service = {
      getFriendsList: jest.fn().mockResolvedValue([]),
      sendFriendRequest: jest.fn().mockResolvedValue({ id: 1, status: 'PENDING' }),
      acceptFriendRequest: jest.fn().mockResolvedValue({ id: 1, status: 'ACCEPTED' }),
      declineFriendRequest: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendsController],
      providers: [
        { provide: FriendsService, useValue: service },
        { provide: JwtService, useValue: {} }
      ]
    }).compile();

    controller = module.get<FriendsController>(FriendsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('routes GET / to getFriendsList with the authenticated user id', async () => {
    await controller.getFriends({ user: { sub: 42 } });
    expect(service.getFriendsList).toHaveBeenCalledWith(42);
  });

  it('routes POST /add to sendFriendRequest with the target username from the body', async () => {
    await controller.addFriend({ user: { sub: 42 } }, 'bob');
    expect(service.sendFriendRequest).toHaveBeenCalledWith(42, 'bob');
  });

  it('routes POST /accept/:id to acceptFriendRequest with a parsed numeric id', async () => {
    await controller.acceptFriend({ user: { sub: 42 } }, '7');
    expect(service.acceptFriendRequest).toHaveBeenCalledWith(42, 7);
  });

  it('routes POST /decline/:id to declineFriendRequest with a parsed numeric id', async () => {
    await controller.declineFriend({ user: { sub: 42 } }, '7');
    expect(service.declineFriendRequest).toHaveBeenCalledWith(42, 7);
  });
});
