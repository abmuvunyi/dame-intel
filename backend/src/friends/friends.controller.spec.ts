import { Test, TestingModule } from '@nestjs/testing';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { JwtService } from '@nestjs/jwt';

describe('FriendsController', () => {
  let controller: FriendsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendsController],
      providers: [
        { provide: FriendsService, useValue: {} },
        { provide: JwtService, useValue: {} }
      ]
    }).compile();

    controller = module.get<FriendsController>(FriendsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
