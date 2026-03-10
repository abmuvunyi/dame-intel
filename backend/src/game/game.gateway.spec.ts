import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';

describe('GameGateway', () => {
  let gateway: GameGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        { provide: JwtService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: HistoryService, useValue: {} }
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
