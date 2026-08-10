import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { DraughtsEngine, PieceColor } from '../../engine/engine.service';

// Plays a complete AI-vs-AI game, asserting at every single half-move that the move the
// AI chose is one the engine actually accepts. `engine.makeMove()` independently
// re-validates legality against its own getLegalMoves() output, so a `false` return here
// would mean the AI generated/selected a move the engine's own rules reject — exactly the
// "AI assumes the old engine's interface" failure mode Phase 3 is checking for.
function playSelfPlayGame(service: AiService, engine: DraughtsEngine, maxHalfMoves = 300) {
  const log: string[] = [];
  let halfMoves = 0;

  while (!engine.isGameOver() && halfMoves < maxHalfMoves) {
    const mover = engine.getCurrentTurn();
    const bestMove = service.getBestMove(engine, 1); // depth 2: fast, sufficient to prove legality
    expect(bestMove).not.toBeNull(); // isGameOver() was false, so a legal move must exist

    const applied = engine.makeMove(bestMove!);
    expect(applied).toBe(true); // the core assertion: never an illegal move

    const capTxt = bestMove!.captured?.length ? ` x${bestMove!.captured.length}` : '';
    log.push(
      `${halfMoves + 1}. ${mover} (${bestMove!.from.row},${bestMove!.from.col})->(${bestMove!.to.row},${bestMove!.to.col})${capTxt}`,
    );
    halfMoves++;
  }

  expect(engine.isGameOver()).toBe(true); // must genuinely terminate, not hit the safety cap

  return {
    halfMoves,
    log,
    winner: engine.getWinner(),
    isDraw: engine.isDraw(),
    drawReason: engine.getDrawReason(),
  };
}

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

  describe('self-play (Phase 3): a complete AI-vs-AI game never attempts an illegal move', () => {
    it('plays a full 8x8 American game to completion', () => {
      const american = DraughtsEngine.createAmerican();
      const result = playSelfPlayGame(service, american);
      // eslint-disable-next-line no-console
      console.log(
        `\n--- 8x8 American self-play: ${result.halfMoves} half-moves, ` +
        `winner=${result.winner ?? (result.isDraw ? `DRAW (${result.drawReason})` : 'none')} ---\n` +
        result.log.join('\n'),
      );
      expect(result.winner !== null || result.isDraw).toBe(true);
    }, 30000);

    it('plays a full 10x10 International game to completion', () => {
      const international = DraughtsEngine.createInternational();
      const result = playSelfPlayGame(service, international);
      // eslint-disable-next-line no-console
      console.log(
        `\n--- 10x10 International self-play: ${result.halfMoves} half-moves, ` +
        `winner=${result.winner ?? (result.isDraw ? `DRAW (${result.drawReason})` : 'none')} ---\n` +
        result.log.join('\n'),
      );
      expect(result.winner !== null || result.isDraw).toBe(true);
    }, 30000);
  });
});
