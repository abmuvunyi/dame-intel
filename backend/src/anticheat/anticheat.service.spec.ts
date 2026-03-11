import { Test, TestingModule } from '@nestjs/testing';
import { AnticheatService } from './anticheat.service';
import { AiService } from '../game/ai/ai/ai.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CheatFlag } from './cheat-flag.entity';

describe('AnticheatService', () => {
  let service: AnticheatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnticheatService,
        { provide: AiService, useValue: {} },
        { provide: getRepositoryToken(CheatFlag), useValue: {} }
      ],
    }).compile();

    service = module.get<AnticheatService>(AnticheatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
