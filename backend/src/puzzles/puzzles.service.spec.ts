import { Test, TestingModule } from '@nestjs/testing';
import { PuzzlesService } from './puzzles.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Puzzle } from './puzzle.entity';

describe('PuzzlesService', () => {
  let service: PuzzlesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzlesService,
        { provide: getRepositoryToken(Puzzle), useValue: {} }
      ],
    }).compile();

    service = module.get<PuzzlesService>(PuzzlesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
