import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { DraughtsEngine, PieceColor } from '../../engine/engine.service';

describe('AiService', () => {
  let service: AiService;
  let engine: DraughtsEngine;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
    engine = new DraughtsEngine();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('evaluates board correctly', () => {
    // Initial board state
    const scoreLight = service.evaluateBoard(engine.getBoard(), PieceColor.LIGHT);
    const scoreDark = service.evaluateBoard(engine.getBoard(), PieceColor.DARK);

    // Both sides should have equal material (12 pieces each), and both control similar back rows,
    // so the scores should be perfectly symmetric.
    expect(scoreLight).toBe(0);
    expect(scoreDark).toBe(0);
  });

  it('finds a best move for difficulty 1', () => {
    const bestMove = service.getBestMove(engine, 1);
    expect(bestMove).toBeDefined();
    expect(bestMove?.from).toBeDefined();
    expect(bestMove?.to).toBeDefined();

    // Since Light moves first, the AI will evaluate moving a light piece
    expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
    expect(bestMove?.from.row).toBe(5); // Must be a light piece starting from bottom
  });

});
