import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Puzzle } from './puzzle.entity';
import { GameHistory } from '../history/history.entity';
import { DraughtsEngine, Move } from '../game/engine/engine.service';
import { AiService } from '../game/ai/ai/ai.service';
import { CLASSIFICATION_THRESHOLDS } from '../game/review/move-classification';
import { classifyGamePhase, GamePhase } from './game-phase';
import { sameMove } from './move-utils';

// Robustness note: simple-json columns are supposed to round-trip as real JS
// values through TypeORM, but the frontend's analysis page already had to defend
// against getting a raw string back in practice (see analysis/[id]/page.tsx) — same
// defensive parse here, for the same reason.
function asObject<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// How deep the generator searches when evaluating each real position — a real
// trade-off, not the engine's own strongest setting: this runs across every ply of
// every scanned game, so it has to stay fast in aggregate. Comfortably deep enough to
// spot real tactics after the killer-move/history-heuristic move-ordering fix (see
// ai.service.ts) made this depth genuinely fast rather than the multi-second-per-move
// cost it would have been before that fix.
const GENERATION_DEPTH = 6;

// Skip the first few plies of every game outright — opening moves are rarely
// meaningful puzzle material (mostly interchangeable development), and treating them
// as candidates the same as a real middlegame tactic would just dilute the set with
// uninteresting "puzzles."
const SKIP_OPENING_PLIES = 6;

// A real mistake occurred (reusing the exact same, already-calibrated thresholds
// Phase 11's post-game review uses — one shared definition of "how much worse was
// this than best" across the whole app, not a second invented number). Deliberately
// the INACCURACY_MAX bar (catches MISTAKE + BLUNDER tier moves, "gives up more than
// half a man"), not the stricter MISTAKE_MAX/BLUNDER-only bar: a live self-play yield
// check found the AI (after the strength fixes above) plays soundly enough that
// requiring outright BLUNDER-tier errors produced only 1 puzzle across 4 full games —
// far too sparse for a real puzzle pool. MISTAKE-tier swings are still genuine,
// meaningful tactical/positional errors, just not exclusively game-losing ones.
const PUZZLE_WORTHY_DELTA = CLASSIFICATION_THRESHOLDS.INACCURACY_MAX;
// A reply is "forced enough" to extend a puzzle's solution by another ply if the gap
// between it and the second-best option clears this — deliberately the stricter
// BLUNDER-level bar (not just MISTAKE_MAX), since a multi-move puzzle solution should
// only ever continue through replies a solver could reasonably be expected to see
// coming, not just "objectively best by a small margin."
const FORCED_REPLY_DELTA = CLASSIFICATION_THRESHOLDS.MISTAKE_MAX * 2.5;
// Hard cap on solution length (solver plies) — keeps generated puzzles genuinely
// solvable in one sitting rather than spiraling into a full mini-game.
const MAX_SOLVER_PLIES = 3;

interface SelfPlayMatchup {
  light: number; // difficulty
  dark: number;
  boardSize: number;
}

// (lightDifficulty, darkDifficulty, boardSize) per game — deliberately varied so the
// resulting positions (and therefore the puzzles found in them) actually differ from
// each other, not four copies of the same forced line. Kept at moderate difficulties
// (not the slow, deep difficulty 7) so seeding stays fast. Includes several lopsided
// pairings on purpose (e.g. 1 vs 4) alongside closely-matched ones: a wide difficulty
// gap makes the weaker side genuinely more likely to misplay a position relative to
// the depth-6 audit search, which is what actually produces puzzle-worthy moments —
// closely-matched games alone (the original roster) turned out to yield almost none.
// Exported so seedFromSelfPlay's own test can pass a smaller override and exercise
// the exact same mechanism quickly, without the real production seed's full cost.
export const DEFAULT_SEED_MATCHUPS: SelfPlayMatchup[] = [
  { light: 3, dark: 2, boardSize: 10 }, // International — Phase 2's variant #1 priority
  { light: 2, dark: 4, boardSize: 10 },
  { light: 1, dark: 4, boardSize: 10 },
  { light: 4, dark: 1, boardSize: 10 },
  { light: 3, dark: 3, boardSize: 8 },
  { light: 4, dark: 2, boardSize: 8 },
  { light: 1, dark: 3, boardSize: 8 },
  { light: 4, dark: 1, boardSize: 8 },
];

interface Candidate {
  move: Move;
  evaluation: number;
}

@Injectable()
export class PuzzleGeneratorService {
  constructor(
    @InjectRepository(Puzzle)
    private puzzlesRepository: Repository<Puzzle>,
    @InjectRepository(GameHistory)
    private historyRepository: Repository<GameHistory>,
    private aiService: AiService,
  ) {}

  /**
   * Scans one completed game move-by-move. At every position (past the opening) where
   * the side to move played meaningfully worse than the engine's own best move — a
   * real mistake or blunder, per the same thresholds Phase 11's post-game review
   * already uses — builds a candidate puzzle whose solution is the engine's actual
   * best line (extended past one ply wherever the position keeps forcing a clear best
   * reply; see FORCED_REPLY_DELTA), tagged with which phase of the game it came from.
   * 'pending' by default, for human review (see the Phase 7 admin flow), same as
   * before this rewrite — `autoPublish` exists only for seedFromSelfPlay below,
   * where the "game" is one this app generated and verified itself, not real player
   * submissions that genuinely need a review step before going live.
   */
  async scanGame(gameId: number, autoPublish = false): Promise<Puzzle[]> {
    const game = await this.historyRepository.findOneBy({ id: gameId });
    if (!game) throw new NotFoundException('Game not found');

    const rules = asObject(game.rules) || {};
    const moves: Move[] = asObject(game.moves) || [];
    const boardSize = rules.boardSize ?? 8;
    // A fresh engine's own initial board tells us the variant's real starting piece
    // count (40 for 10x10 International, 24 for 8x8 American) without hardcoding
    // either number here.
    const startingPieceCount = this.countPieces(new DraughtsEngine({ ...rules, boardSize }).getBoard());

    const engine = new DraughtsEngine({ ...rules, boardSize });
    const candidates: Puzzle[] = [];

    for (let ply = 0; ply < moves.length; ply++) {
      const playedMove = moves[ply];

      if (ply >= SKIP_OPENING_PLIES) {
        const legalMoves = engine.getLegalMoves();
        if (legalMoves.length >= 2) {
          const evaluations = this.aiService.analyzePosition(engine, GENERATION_DEPTH);
          const best = evaluations[0];
          const playedEval = evaluations.find((e) => sameMove(e.move, playedMove));

          if (best && playedEval) {
            const delta = best.evaluation - playedEval.evaluation;
            if (delta > PUZZLE_WORTHY_DELTA) {
              const puzzle = await this.buildCandidate(engine, boardSize, gameId, startingPieceCount, autoPublish);
              if (puzzle) candidates.push(puzzle);
            }
          }
        }
      }

      const applied = engine.makeMove(playedMove);
      if (!applied) break; // malformed/legacy history entry — stop rather than desync silently
    }

    return candidates;
  }

  // Real starter content, replacing what used to be ~4 hand-authored, artificial
  // 2-3-piece toy positions — a direct fix for "puzzles are too shallow, try
  // middlegames and real endgames, not 1-3 pawns only." Self-plays a small set of
  // real games (mixing both board sizes, and varying which difficulty plays which
  // side so the games actually diverge from each other rather than all following
  // the same line), persists each as a real GameHistory row, then runs the exact
  // same scanGame detection used for real player games on them — so this produces
  // genuine tactical/positional moments spanning the opening through real endgames,
  // not invented positions. Auto-published (see scanGame's autoPublish param) since
  // this is the app's own verified content, not a real player's game awaiting review.
  async seedFromSelfPlay(matchups: SelfPlayMatchup[] = DEFAULT_SEED_MATCHUPS): Promise<{ gamesPlayed: number; puzzlesCreated: number }> {
    // A live yield check found self-played games between these difficulties typically
    // don't reach real endgame material (piece fraction <= 0.35, see game-phase.ts)
    // until somewhere around ply 46-79 depending on matchup/board size — with the old
    // 50-ply cap, almost every game got cut off still in the middlegame, so the
    // resulting puzzle pool had zero endgame puzzles despite "real endgames, not just
    // middlegames" being an explicit requirement. 100 plies comfortably covers the
    // endgame transition for all sampled matchups.
    const MAX_PLIES_PER_GAME = 100;

    let puzzlesCreated = 0;
    for (const matchup of matchups) {
      const engine = new DraughtsEngine({ boardSize: matchup.boardSize });
      const moves: Move[] = [];

      for (let ply = 0; ply < MAX_PLIES_PER_GAME && !engine.isGameOver(); ply++) {
        const lightToMove = engine.getCurrentTurn() === 'L';
        const move = this.aiService.getBestMove(engine, lightToMove ? matchup.light : matchup.dark);
        if (!move) break;
        engine.makeMove(move);
        moves.push(move);
      }
      if (moves.length === 0) continue;

      // Same 'L'/'D' -> 'LIGHT'/'DARK' convention HistoryService.saveGame uses —
      // GameHistory.winner is documented as storing the long form, not the engine's
      // own short PieceColor codes.
      const engineWinner = engine.isDraw() ? null : engine.getWinner();
      const winner = engineWinner === 'L' ? 'LIGHT' : engineWinner === 'D' ? 'DARK' : 'DRAW';

      const game = await this.historyRepository.save(this.historyRepository.create({
        winner,
        moves,
        rules: engine.getRules(),
      }));

      const candidates = await this.scanGame(game.id, true);
      puzzlesCreated += candidates.length;
    }

    return { gamesPlayed: matchups.length, puzzlesCreated };
  }

  async scanRecentGames(limit: number = 20): Promise<{ gameId: number; candidatesFound: number }[]> {
    const games = await this.historyRepository.find({ order: { playedAt: 'DESC' }, take: limit });
    const results: { gameId: number; candidatesFound: number }[] = [];
    for (const game of games) {
      const candidates = await this.scanGame(game.id);
      results.push({ gameId: game.id, candidatesFound: candidates.length });
    }
    return results;
  }

  // Builds and persists a candidate puzzle from the CURRENT position of `engine`
  // (before the mistake that flagged it) — extends the solution past one solver ply
  // wherever the position keeps forcing a clear best reply on both sides, up to
  // MAX_SOLVER_PLIES. Works on a cloned engine so scanGame's own walk through the
  // real game continues unaffected by this exploratory line.
  private async buildCandidate(
    sourceEngine: DraughtsEngine,
    boardSize: number,
    gameId: number,
    startingPieceCount: number,
    autoPublish = false,
  ): Promise<Puzzle | null> {
    const rules = sourceEngine.getRules();
    const startingBoard = JSON.parse(JSON.stringify(sourceEngine.getBoard()));
    const turnToMove = sourceEngine.getCurrentTurn();

    const walker = new DraughtsEngine(rules);
    walker.loadBoard(JSON.parse(JSON.stringify(startingBoard)), turnToMove);

    const solution: Move[] = [];
    let maxDelta = 0;

    for (let solverPly = 0; solverPly < MAX_SOLVER_PLIES; solverPly++) {
      const evaluations = this.aiService.analyzePosition(walker, GENERATION_DEPTH);
      if (evaluations.length === 0) break;
      const best = evaluations[0];
      const secondBest = evaluations[1];
      const gap = secondBest ? best.evaluation - secondBest.evaluation : Infinity;

      solution.push(best.move);
      maxDelta = Math.max(maxDelta, gap === Infinity ? PUZZLE_WORTHY_DELTA : gap);
      walker.makeMove(best.move);

      if (walker.isGameOver()) break;

      // Extend into the opponent's forced reply (if genuinely forced/clear) so the
      // solver also has to see past it, then loop back for another solver ply.
      // Puzzle.solution is a FLAT array alternating solver-move/opponent-reply at
      // even/odd indices (see puzzles.service.ts's attemptMove, which auto-plays
      // whatever sits at the odd index right after validating the even one) — the
      // opponent's reply belongs IN this same array, not tracked separately, or
      // solving would desync from moveIndex onward the first time a real player
      // reached one of these multi-ply puzzles.
      const opponentEvals = this.aiService.analyzePosition(walker, GENERATION_DEPTH);
      if (opponentEvals.length === 0) break;
      const opponentBest = opponentEvals[0];
      const opponentSecond = opponentEvals[1];
      const opponentGap = opponentSecond ? opponentBest.evaluation - opponentSecond.evaluation : Infinity;

      if (opponentGap < FORCED_REPLY_DELTA && opponentEvals.length > 1) break; // not forced enough — stop here, this is the puzzle
      solution.push(opponentBest.move);
      walker.makeMove(opponentBest.move);
      if (walker.isGameOver()) break;
    }

    if (solution.length === 0) return null;

    const gamePhase: GamePhase = classifyGamePhase(this.countPieces(startingBoard), startingPieceCount);
    // Harder if the swing is bigger and/or the solution runs deeper — a longer forced
    // sequence is genuinely harder to calculate than a single obvious capture, and a
    // small-but-real mistake (just past MISTAKE_MAX) is easier to spot than a
    // full blunder. solution.length counts BOTH sides' plies now, so >=3 (at least one
    // full solver-reply-solver round trip) is the real "this got deeper" signal.
    const difficulty = solution.length >= 3 || maxDelta > PUZZLE_WORTHY_DELTA * 2 ? 3 : 2;

    const puzzle = this.puzzlesRepository.create({
      difficulty,
      boardSize,
      board: startingBoard,
      turnToMove,
      solution,
      status: autoPublish ? 'published' : 'pending',
      sourceGameId: gameId,
      gamePhase,
    });
    return this.puzzlesRepository.save(puzzle);
  }

  private countPieces(board: any[][]): number {
    let count = 0;
    for (const row of board) for (const cell of row) if (cell) count++;
    return count;
  }
}
