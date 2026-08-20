import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { DraughtsEngine, PieceColor, PieceType, BoardState } from '../../engine/engine.service';

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

  // Engine rewrite: real, measured behavioral proof the classical-engine fixes
  // (quiescence search, proper terminal scoring, transposition table, iterative
  // deepening with a time budget) do what they claim, not just "still passes the
  // pre-existing tests". Every board below was verified against the real engine
  // before being hardcoded here (see PR description) — not hand-traced blind.
  describe('quiescence search avoids the horizon effect', () => {
    // LIGHT has a piece at (3,4) hanging to a forced DARK recapture one ply after
    // ANY light move (a light man at (1,2) blocks light's own capture of it, so this
    // is a genuine one-sided threat, not a mutual trade LIGHT could just take first).
    // Without quiescence, evaluating the position immediately after a "quiet" light
    // move (before DARK's forced capture is simulated) reports a naive material
    // snapshot that hasn't yet accounted for the piece LIGHT is guaranteed to lose.
    function buildHangingPieceBoard(): BoardState {
      const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
      board[3][4] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // hangs to a forced recapture
      board[1][2] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // blocks LIGHT's own capture of (2,3)
      board[6][1] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // free to make an unrelated "quiet" move
      board[2][3] = { color: PieceColor.DARK, type: PieceType.MAN };  // will be forced to recapture
      return board;
    }

    it('discounts a quiet move that leaves a piece hanging to a forced recapture, below the naive material snapshot', () => {
      const naiveEngine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      naiveEngine.loadBoard(buildHangingPieceBoard(), PieceColor.LIGHT);
      naiveEngine.makeMove({ from: { row: 6, col: 1 }, to: { row: 5, col: 0 } });
      const naiveEval = service.evaluateBoard(naiveEngine.getBoard(), PieceColor.LIGHT);

      const rootEngine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      rootEngine.loadBoard(buildHangingPieceBoard(), PieceColor.LIGHT);
      const evaluations = service.analyzePosition(rootEngine, 1);
      const quietMoveEval = evaluations.find(
        e => e.move.from.row === 6 && e.move.from.col === 1 && e.move.to.row === 5 && e.move.to.col === 0,
      );

      expect(quietMoveEval).toBeDefined();
      // The naive snapshot (26) doesn't yet reflect the man LIGHT is guaranteed to
      // lose; quiescence search does, and correctly reports a lower value for it.
      expect(quietMoveEval!.evaluation).toBeLessThan(naiveEval);
    });

    it('correctly prefers moving the hanging piece to safety over an unrelated quiet move', () => {
      const rootEngine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      rootEngine.loadBoard(buildHangingPieceBoard(), PieceColor.LIGHT);
      const evaluations = service.analyzePosition(rootEngine, 1);

      // (3,4) -> (2,5) walks the threatened piece out of danger entirely.
      const savingMove = evaluations.find(e => e.move.from.row === 3 && e.move.from.col === 4);
      const quietMove = evaluations.find(
        e => e.move.from.row === 6 && e.move.from.col === 1 && e.move.to.row === 5 && e.move.to.col === 0,
      );

      expect(savingMove).toBeDefined();
      expect(quietMove).toBeDefined();
      expect(savingMove!.evaluation).toBeGreaterThan(quietMove!.evaluation);
      expect(evaluations[0].move).toEqual(savingMove!.move); // the engine's own top choice
    });
  });

  describe('proper terminal (forced win/loss) scoring', () => {
    // DARK's only piece, at (0,1), is permanently boxed in by three static LIGHT
    // pieces (blocking both its move squares and the one capture-landing square that
    // would otherwise be reachable) — verified directly below via isGameOver()/
    // getWinner() on the actual resulting position, not assumed. LIGHT has a fourth,
    // completely unrelated piece free to make a quiet move.
    function buildBoxedOpponentBoard(): BoardState {
      const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
      board[0][1] = { color: PieceColor.DARK, type: PieceType.MAN };
      board[1][0] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[1][2] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[2][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[6][1] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      return board;
    }

    it('sanity: the constructed position genuinely leaves DARK with zero legal moves after the quiet move', () => {
      const engine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      engine.loadBoard(buildBoxedOpponentBoard(), PieceColor.LIGHT);
      engine.makeMove({ from: { row: 6, col: 1 }, to: { row: 5, col: 0 } });

      expect(engine.getLegalMoves()).toHaveLength(0);
      expect(engine.isGameOver()).toBe(true);
      expect(engine.getWinner()).toBe(PieceColor.LIGHT);
    });

    it('scores a move that forces this outcome at WIN_SCORE magnitude, not a modest material count', () => {
      const engine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      engine.loadBoard(buildBoxedOpponentBoard(), PieceColor.LIGHT);

      // What the OLD code (falling straight through to evaluateBoard on any
      // terminal/depth-0 node) would have reported for this exact position — a
      // modest material lead, giving no special weight to "opponent literally cannot
      // move again". Confirms the two scores are meaningfully different in kind, not
      // just in degree.
      const afterQuietMove = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      afterQuietMove.loadBoard(buildBoxedOpponentBoard(), PieceColor.LIGHT);
      afterQuietMove.makeMove({ from: { row: 6, col: 1 }, to: { row: 5, col: 0 } });
      const naiveMaterialEval = service.evaluateBoard(afterQuietMove.getBoard(), PieceColor.LIGHT);
      expect(naiveMaterialEval).toBeLessThan(100); // a real but modest material lead

      const evaluations = service.analyzePosition(engine, 2);
      const quietMoveEval = evaluations.find(
        e => e.move.from.row === 6 && e.move.from.col === 1 && e.move.to.row === 5 && e.move.to.col === 0,
      );

      expect(quietMoveEval).toBeDefined();
      expect(quietMoveEval!.evaluation).toBeGreaterThanOrEqual(100_000); // WIN_SCORE
      expect(evaluations[0].move).toEqual(quietMoveEval!.move); // correctly the engine's top choice
    });
  });

  describe('iterative deepening respects a wall-clock time budget', () => {
    it('getBestMove at the hardest difficulty returns within a bounded time, not an unbounded search', () => {
      const engine = DraughtsEngine.createInternational(); // 10x10, the larger/slower board
      const start = Date.now();
      const move = service.getBestMove(engine, 7);
      const elapsedMs = Date.now() - start;

      expect(move).not.toBeNull();
      // The difficulty-7 time budget is 4.5s; a generous ceiling above that catches a
      // genuine regression (e.g. a reintroduced unbounded search) without being flaky
      // over normal per-node overhead.
      expect(elapsedMs).toBeLessThan(7000);
    });

    it('a lower difficulty returns meaningfully faster than the hardest one, reflecting its smaller time budget', () => {
      const engine = DraughtsEngine.createInternational();

      const startEasy = Date.now();
      service.getBestMove(engine, 1);
      const easyElapsedMs = Date.now() - startEasy;

      const startHard = Date.now();
      service.getBestMove(engine, 7);
      const hardElapsedMs = Date.now() - startHard;

      expect(easyElapsedMs).toBeLessThan(hardElapsedMs);
    });
  });
});
