import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { Puzzle } from './puzzle.entity';
import { GameHistory } from '../history/history.entity';
import { User } from '../users/user.entity';
import { PieceColor, PieceType, Move, BoardState, DraughtsEngine } from '../game/engine/engine.service';
import { AiService } from '../game/ai/ai/ai.service';

// Rewritten alongside the generator itself: puzzle generation moved from "did the
// player miss a big capture" (narrow — only ever found forced-jump moments, which is
// exactly why puzzle content skewed toward sparse late-game capture scraps) to "did
// the player play meaningfully worse than the engine's own best move, per the same
// thresholds Phase 11's post-game review already uses" — catching real mistakes
// across every phase of a real game, with multi-ply solutions where the position
// keeps forcing a clear reply. Every board/move sequence below was verified against
// the real engine and a real AiService before being hardcoded here (see this PR's
// description), not hand-traced blind.
describe('PuzzleGeneratorService', () => {
  let service: PuzzleGeneratorService;
  let historyRepo: any;
  let aiService: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [Puzzle, GameHistory, User], synchronize: true }),
        TypeOrmModule.forFeature([Puzzle, GameHistory]),
      ],
      providers: [PuzzleGeneratorService, AiService],
    }).compile();

    service = module.get<PuzzleGeneratorService>(PuzzleGeneratorService);
    historyRepo = (service as any).historyRepository;
    aiService = module.get<AiService>(AiService);
  });

  // A real 13-ply 8x8 American game prefix (found by real self-play, not
  // hand-derived): every ply is literally the depth-6 audit's own best move, so the
  // prefix is guaranteed clean (delta 0) at every evaluated ply — this matters now
  // that PUZZLE_WORTHY_DELTA was lowered to catch MISTAKE-tier swings too, not just
  // outright BLUNDER-tier ones (see puzzle-generator.service.ts); a looser bar means
  // a "clean" fixture prefix has to genuinely be clean throughout, not just at its
  // final ply, or it flags on an earlier ply the old, stricter bar used to hide.
  // Ply 13 (DARK to move) then plays the worst of 8 legal options (eval -43) instead
  // of the best (eval 4) — a real, verified 47-point mistake.
  const PREFIX: Move[] = [
    { from: { row: 5, col: 4 }, to: { row: 4, col: 3 } },
    { from: { row: 2, col: 5 }, to: { row: 3, col: 6 } },
    { from: { row: 5, col: 6 }, to: { row: 4, col: 5 } },
    { from: { row: 3, col: 6 }, to: { row: 5, col: 4 }, captured: [{ row: 4, col: 5 }] },
    { from: { row: 6, col: 3 }, to: { row: 4, col: 5 }, captured: [{ row: 5, col: 4 }] },
    { from: { row: 2, col: 3 }, to: { row: 3, col: 4 } },
    { from: { row: 4, col: 3 }, to: { row: 2, col: 5 }, captured: [{ row: 3, col: 4 }] },
    { from: { row: 1, col: 4 }, to: { row: 5, col: 4 }, captured: [{ row: 2, col: 5 }, { row: 4, col: 5 }] },
    { from: { row: 6, col: 5 }, to: { row: 4, col: 3 }, captured: [{ row: 5, col: 4 }] },
    { from: { row: 2, col: 1 }, to: { row: 3, col: 2 } },
    { from: { row: 4, col: 3 }, to: { row: 2, col: 1 }, captured: [{ row: 3, col: 2 }] },
    { from: { row: 1, col: 0 }, to: { row: 3, col: 2 }, captured: [{ row: 2, col: 1 }] },
    { from: { row: 5, col: 2 }, to: { row: 4, col: 1 } },
  ];
  const BEST_MOVE: Move = { from: { row: 1, col: 2 }, to: { row: 2, col: 3 } }; // eval 4
  const BLUNDER_MOVE: Move = { from: { row: 0, col: 1 }, to: { row: 1, col: 0 } }; // eval -43

  it('flags a real position where the played move was meaningfully worse than the engine\'s best', async () => {
    const game = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [...PREFIX, BLUNDER_MOVE],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await service.scanGame(game.id);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].status).toBe('pending');
    expect(candidates[0].sourceGameId).toBe(game.id);
    expect(candidates[0].turnToMove).toBe(PieceColor.DARK);
    // The opponent's own reply gap at this position is well under FORCED_REPLY_DELTA,
    // so the solution stops after the one solver move.
    expect(candidates[0].solution).toEqual([BEST_MOVE]);
    expect(candidates[0].difficulty).toBe(2); // single-ply solution, moderate swing
    expect(candidates[0].gamePhase).toBe('middlegame'); // 16/24 pieces still on the board
  }, 30000);

  it('does not flag a position where the engine\'s own best move was the one actually played', async () => {
    const game = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [...PREFIX, BEST_MOVE],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await service.scanGame(game.id);
    expect(candidates).toHaveLength(0);
  }, 30000);

  it('does not flag a position with fewer than 2 legal moves (nothing to compare against)', async () => {
    // A real, verified 8-ply prefix (the first 8 plies of PREFIX above — every ply the
    // depth-6 audit's own best move, so clean throughout, not just superficially)
    // that reaches a genuinely single-legal-move position at ply 8 — past
    // SKIP_OPENING_PLIES, so this specifically proves the "<2 legal moves" guard, not
    // the opening skip.
    const prefixToForced: Move[] = PREFIX.slice(0, 8);
    const forcedMove: Move = { from: { row: 6, col: 5 }, to: { row: 4, col: 3 }, captured: [{ row: 5, col: 4 }] };

    const engine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
    for (const m of prefixToForced) expect(engine.makeMove(m)).toBe(true);
    expect(engine.getLegalMoves()).toEqual([forcedMove]); // sanity: genuinely forced, only one option

    const game = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [...prefixToForced, forcedMove],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await service.scanGame(game.id);
    expect(candidates).toHaveLength(0);
  }, 30000);

  it('never evaluates (and therefore never flags) positions within the opening-skip window, regardless of how bad the move was', async () => {
    // A fake AiService that would ALWAYS report a huge delta if it were ever asked —
    // isolates the ply-skip gating itself from the real eval-based detection already
    // covered above by the real-AiService tests.
    const analyzePosition = jest.fn().mockReturnValue([
      { move: { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }, evaluation: 1000 },
      { move: { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }, evaluation: -1000 },
    ]);
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [Puzzle, GameHistory, User], synchronize: true }),
        TypeOrmModule.forFeature([Puzzle, GameHistory]),
      ],
      providers: [PuzzleGeneratorService, { provide: AiService, useValue: { analyzePosition } }],
    }).compile();
    const isolatedService = module.get<PuzzleGeneratorService>(PuzzleGeneratorService);
    const isolatedHistoryRepo = (isolatedService as any).historyRepository;

    // 5 real plies — one short of SKIP_OPENING_PLIES (6) — so every one of them is
    // still within the skip window.
    const shortGame = PREFIX.slice(0, 5);
    const game = await isolatedHistoryRepo.save(isolatedHistoryRepo.create({
      winner: 'DRAW',
      moves: shortGame,
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await isolatedService.scanGame(game.id);
    expect(candidates).toHaveLength(0);
    expect(analyzePosition).not.toHaveBeenCalled();
  });

  // Exercises buildCandidate's multi-ply extension directly on a small, fully
  // hand-verified endgame position, rather than needing an even longer real-game
  // prefix to reach one naturally — a real forced sequence: LIGHT's king captures,
  // leaving DARK with exactly one legal move (genuinely forced, not just "clearly
  // best"), which the puzzle's solution correctly includes before LIGHT's follow-up.
  describe('buildCandidate: multi-ply solutions and game-phase tagging', () => {
    it('extends the solution through a genuinely forced opponent reply, and tags a sparse position as an endgame', async () => {
      const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
      board[4][3] = { color: PieceColor.LIGHT, type: PieceType.KING };
      board[3][4] = { color: PieceColor.DARK, type: PieceType.MAN };
      board[6][7] = { color: PieceColor.DARK, type: PieceType.MAN }; // corner-ish: exactly one legal move once it's DARK's turn

      const engine = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      engine.loadBoard(board, PieceColor.LIGHT);

      const result = await (service as any).buildCandidate(engine, 8, 999, 24);

      expect(result).not.toBeNull();
      // solver capture, DARK's forced reply, solver's follow-up — verified directly
      // against the real engine/AI before being hardcoded here.
      expect(result.solution).toEqual([
        { from: { row: 4, col: 3 }, to: { row: 2, col: 5 }, captured: [{ row: 3, col: 4 }] },
        { from: { row: 6, col: 7 }, to: { row: 7, col: 6 } },
        { from: { row: 2, col: 5 }, to: { row: 3, col: 4 } },
      ]);
      expect(result.gamePhase).toBe('endgame'); // 3 pieces / 24 starting
      expect(result.difficulty).toBe(3); // 3-ply solution
      expect(result.sourceGameId).toBe(999);

      // The solution must actually replay against the real engine, alternating
      // solver/opponent at even/odd indices exactly as puzzles.service.ts's
      // attemptMove expects — this is the real correctness bar, not just "some array
      // of moves got returned."
      const replay = new DraughtsEngine({ boardSize: 8, variant: 'american' });
      replay.loadBoard(JSON.parse(JSON.stringify(result.board)), result.turnToMove);
      for (const move of result.solution) {
        expect(replay.makeMove(move)).toBe(true);
      }
    });
  });

  // Real starter content — replaces what used to be ~4 hand-authored, artificial
  // 2-3-piece toy positions (see seedFromSelfPlay's own comment). This is
  // necessarily an integration-style test (real self-play, real scanning, no
  // hand-verified fixed position) since the whole point is "genuinely varied content
  // from real games," not a predetermined outcome — assertions are on structural
  // correctness (real games got saved, any puzzles found are properly shaped and
  // published) rather than an exact puzzle count, which legitimately varies run to
  // run with what mistakes the self-played games happen to contain.
  describe('seedFromSelfPlay', () => {
    it('self-plays real games across both board sizes and auto-publishes any real puzzles found in them', async () => {
      // A small override (real code path, same as production's DEFAULT_SEED_MATCHUPS,
      // just fewer/shorter games) — keeps this genuinely real integration test fast
      // enough for the routine test suite rather than production's own ~45s cost.
      const result = await service.seedFromSelfPlay([
        { light: 3, dark: 2, boardSize: 10 },
        { light: 3, dark: 3, boardSize: 8 },
      ]);

      expect(result.gamesPlayed).toBe(2);
      expect(result.puzzlesCreated).toBeGreaterThanOrEqual(0);

      const savedGames = await historyRepo.find();
      expect(savedGames).toHaveLength(2);
      for (const game of savedGames) {
        const moves = typeof game.moves === 'string' ? JSON.parse(game.moves) : game.moves;
        expect(moves.length).toBeGreaterThan(0);
        expect(['LIGHT', 'DARK', 'DRAW']).toContain(game.winner); // not a raw 'L'/'D' engine code
      }

      // Both board sizes actually got played, not just one.
      const boardSizes = new Set(savedGames.map((g: any) => (typeof g.rules === 'string' ? JSON.parse(g.rules) : g.rules).boardSize));
      expect(boardSizes.has(8)).toBe(true);
      expect(boardSizes.has(10)).toBe(true);

      if (result.puzzlesCreated > 0) {
        const puzzlesRepo = (service as any).puzzlesRepository;
        const createdPuzzles = await puzzlesRepo.find();
        for (const puzzle of createdPuzzles) {
          expect(puzzle.status).toBe('published'); // auto-published, unlike real-player-game candidates
          expect(puzzle.gamePhase).not.toBeNull();
          expect(['opening', 'middlegame', 'endgame']).toContain(puzzle.gamePhase);
          expect(savedGames.some((g: any) => g.id === puzzle.sourceGameId)).toBe(true);
        }
      }
    }, 180000);
  });

  describe('scanRecentGames', () => { jest.setTimeout(30000);
    it('scans multiple games and reports candidate counts per game', async () => {
      const g1 = await historyRepo.save(historyRepo.create({
        winner: 'DRAW',
        moves: [{ from: { row: 5, col: 4 }, to: { row: 4, col: 5 } }],
        rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
      }));
      const g2 = await historyRepo.save(historyRepo.create({
        winner: 'DRAW',
        moves: [{ from: { row: 5, col: 2 }, to: { row: 4, col: 3 } }],
        rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
      }));

      const results = await service.scanRecentGames(10);
      expect(results.map(r => r.gameId).sort()).toEqual([g1.id, g2.id].sort());
    });
  });
});
