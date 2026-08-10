import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisController } from './analysis.controller';
import { AiService } from './ai/ai/ai.service';
import { DraughtsEngine, PieceColor, PieceType, BoardState } from './engine/engine.service';

describe('AnalysisController', () => {
  let controller: AnalysisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [AiService],
    }).compile();

    controller = module.get<AnalysisController>(AnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('analyzes an 8x8 board using 8x8 rules', () => {
    const engine = DraughtsEngine.createAmerican();
    const evaluations = controller.analyze({ board: engine.getBoard(), turn: PieceColor.LIGHT, depth: 2 });
    expect(evaluations.length).toBeGreaterThan(0);
    for (const { move } of evaluations) {
      expect(move.from.row).toBeLessThan(8);
      expect(move.to.row).toBeLessThan(8);
    }
  });

  // Regression test: analyze() used to construct `new DraughtsEngine()` with no rules at
  // all, defaulting to an 8x8 board regardless of what was submitted. getLegalMoves()'s
  // own scan is bounded by rules.boardSize, so a piece sitting on row 9 of a 10x10 board
  // would have been completely invisible to move generation under that bug — not just
  // clipped, but silently skipped entirely, before analysis even started.
  it('analyzes a 10x10 board using 10x10 rules, not the 8x8 default', () => {
    const board: BoardState = Array(10).fill(null).map(() => Array(10).fill(null));
    board[9][0] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    const evaluations = controller.analyze({ board, turn: PieceColor.LIGHT, depth: 1 });
    expect(evaluations.length).toBeGreaterThan(0);
    expect(evaluations.some(({ move }) => move.from.row === 9)).toBe(true);
  });
});
