import { Test, TestingModule } from '@nestjs/testing';
import { PuzzlesController } from './puzzles.controller';
import { PuzzlesService } from './puzzles.service';
import { PuzzleRushService } from './puzzle-rush.service';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { JwtService } from '@nestjs/jwt';

describe('PuzzlesController', () => {
  let controller: PuzzlesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PuzzlesController],
      providers: [
        { provide: PuzzlesService, useValue: {} },
        { provide: PuzzleRushService, useValue: {} },
        { provide: PuzzleGeneratorService, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PuzzlesController>(PuzzlesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
