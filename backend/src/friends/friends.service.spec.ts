import { Test, TestingModule } from '@nestjs/testing';
import { FriendsService } from './friends.service';
import { UsersService } from '../users/users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Friendship } from './friendship.entity';

describe('FriendsService', () => {
  let service: FriendsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendsService,
        { provide: UsersService, useValue: {} },
        { provide: getRepositoryToken(Friendship), useValue: {} }
      ],
    }).compile();

    service = module.get<FriendsService>(FriendsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
