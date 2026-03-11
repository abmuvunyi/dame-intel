import { Test, TestingModule } from '@nestjs/testing';
import { HistoryService } from './history.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GameHistory } from './history.entity';

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: getRepositoryToken(GameHistory), useValue: {} }
      ],
    }).compile();

    service = module.get<HistoryService>(HistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
