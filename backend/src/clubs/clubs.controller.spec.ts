import { Test, TestingModule } from '@nestjs/testing';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { JwtService } from '@nestjs/jwt';

describe('ClubsController', () => {
  let controller: ClubsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      getAllClubs: jest.fn().mockResolvedValue([]),
      getMyClubs: jest.fn().mockResolvedValue([]),
      getClub: jest.fn().mockResolvedValue({ id: 1 }),
      getClubMembers: jest.fn().mockResolvedValue([]),
      createClub: jest.fn().mockResolvedValue({ id: 1 }),
      joinClub: jest.fn().mockResolvedValue({ id: 1 }),
      leaveClub: jest.fn().mockResolvedValue({ success: true }),
      getClubFeed: jest.fn().mockResolvedValue([]),
      postToClub: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClubsController],
      providers: [
        { provide: ClubsService, useValue: service },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ClubsController>(ClubsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('routes POST / to createClub with the authenticated user id', async () => {
    await controller.createClub({ user: { sub: 42 } }, { name: 'Club', description: 'desc' });
    expect(service.createClub).toHaveBeenCalledWith(42, 'Club', 'desc');
  });

  it('routes POST /:id/join to joinClub', async () => {
    await controller.joinClub({ user: { sub: 42 } }, 7);
    expect(service.joinClub).toHaveBeenCalledWith(7, 42);
  });

  it('routes POST /:id/leave to leaveClub', async () => {
    await controller.leaveClub({ user: { sub: 42 } }, 7);
    expect(service.leaveClub).toHaveBeenCalledWith(7, 42);
  });

  it('routes GET /:id/posts to getClubFeed', async () => {
    await controller.getFeed({ user: { sub: 42 } }, 7);
    expect(service.getClubFeed).toHaveBeenCalledWith(7, 42);
  });

  it('routes POST /:id/posts to postToClub with the body content', async () => {
    await controller.createPost({ user: { sub: 42 } }, 7, 'hello club');
    expect(service.postToClub).toHaveBeenCalledWith(7, 42, 'hello club');
  });
});
