import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Puzzle } from './puzzle.entity';
import { PlayerPuzzleRating } from './player-puzzle-rating.entity';
import { PieceColor, Move, BoardState, DraughtsEngine } from '../game/engine/engine.service';
import { updateRating, GLICKO2_DEFAULTS } from '../rating/glicko2';
import { sameMove } from './move-utils';
import { hashDateToIndex } from './daily-puzzle';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { errorDetail } from '../common/error-detail';

const logger = new Logger('PuzzlesService');

export interface PuzzleAttemptResult {
  correct: boolean;
  solved: boolean;
  board?: BoardState;
  turn?: PieceColor;
  nextMoveIndex?: number;
  solutionMove?: Move; // revealed only once the attempt has failed
  opponentMove?: Move; // the auto-played reply, if any — lets the client animate it separately from the solver's own move
}

// Reconstructs the position at a given ply by replaying the puzzle's solution from
// its starting board — the single source of truth both attemptMove() and
// getLegalMoves() build on, so "what's legal here" always means the same thing in
// both places.
function reconstructEngine(puzzle: Puzzle, moveIndex: number): DraughtsEngine {
  const engine = new DraughtsEngine({ boardSize: puzzle.boardSize });
  engine.loadBoard(
    JSON.parse(JSON.stringify(puzzle.board)),
    (puzzle.turnToMove as PieceColor) === PieceColor.LIGHT ? PieceColor.LIGHT : PieceColor.DARK,
  );
  for (let i = 0; i < moveIndex; i++) {
    engine.makeMove(puzzle.solution[i]);
  }
  return engine;
}

@Injectable()
export class PuzzlesService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Puzzle)
    private puzzlesRepository: Repository<Puzzle>,
    @InjectRepository(PlayerPuzzleRating)
    private playerRatingRepository: Repository<PlayerPuzzleRating>,
    private puzzleGeneratorService: PuzzleGeneratorService,
  ) {}

  // Phase 14: seeding used to run inside onModuleInit and was AWAITED, so a fresh
  // database held the whole server back from listening for ~45s of CPU-bound
  // self-play — long enough for most cloud health checks to kill and restart the
  // container, which then starts seeding again. It now starts after boot, in the
  // background, and can be turned off with PUZZLE_SEED_ON_BOOT=false (tests,
  // additional replicas).
  onApplicationBootstrap() {
    if (process.env.PUZZLE_SEED_ON_BOOT === 'false') return;
    const timer = setTimeout(() => {
      this.seedIfEmpty().catch((err) => logger.error(`Puzzle seeding failed: ${errorDetail(err)}`));
    }, 1000);
    timer.unref(); // never keep a short-lived process (CLI script, test) alive
  }

  // Seed initial puzzles if none exist. Self-played and scanned for real tactical/
  // positional moments (see PuzzleGeneratorService.seedFromSelfPlay) rather than a
  // handful of hand-authored, artificial 2-3-piece toy positions — this used to be
  // ~4 hardcoded puzzles, none of which were real middlegame or proper endgame
  // material, exactly the complaint this rewrite fixes.
  async seedIfEmpty(): Promise<void> {
    const count = await this.puzzlesRepository.count();
    if (count === 0) {
      logger.log('Seeding initial draughts puzzles via self-play...');
      const result = await this.puzzleGeneratorService.seedFromSelfPlay();
      logger.log(`Seeded ${result.puzzlesCreated} puzzles from ${result.gamesPlayed} self-played games.`);
    }
  }


  // What a client is allowed to see: never the solution. Solving is validated
  // server-side against the real engine (see attemptMove) specifically so a puzzle
  // can't just be read out of the network tab, unlike the previous implementation.
  toPublic(puzzle: Puzzle) {
    const { solution: _solution, ...publicFields } = puzzle;
    return publicFields;
  }

  // Phase 13: the other feature actually gated behind PREMIUM (alongside analysis
  // depth — see analysis.controller.ts). A free/anonymous solver never even sees a
  // premium puzzle offered at random; getLegalMoves/attemptMove below additionally
  // refuse direct access by id, so gating can't be bypassed just by knowing/guessing
  // a premium puzzle's id.
  async getRandomPuzzle(difficulty?: number, hasPremium = false) {
    const query = this.puzzlesRepository.createQueryBuilder('puzzle')
      .where('puzzle.status = :status', { status: 'published' });
    if (!hasPremium) {
      query.andWhere('puzzle.isPremium = :isPremium', { isPremium: false });
    }
    if (difficulty) {
      query.andWhere('puzzle.difficulty = :diff', { diff: difficulty });
    }
    query.orderBy('RANDOM()').limit(1);
    let result = await query.getOne();

    if (!result) {
      const where: any = { status: 'published' };
      if (!hasPremium) where.isPremium = false;
      const all = await this.puzzlesRepository.find({ where });
      result = all[Math.floor(Math.random() * all.length)];
    }
    return result ? this.toPublic(result) : null;
  }

  // Home-dashboard "Daily Puzzle": one shared puzzle, the same for every visitor on a
  // given UTC calendar day, deterministically selected (see daily-puzzle.ts) rather
  // than random — a random pick would show a different puzzle on every page load,
  // which isn't what "daily" means. Free for everyone regardless of membership tier
  // on purpose: this mirrors chess.com's own daily puzzle, which is a shared
  // free-for-all hook feature, not a premium perk — so it deliberately bypasses the
  // isPremium gating getRandomPuzzle/getLegalMoves/attemptMove enforce elsewhere.
  async getDailyPuzzle() {
    const all = await this.puzzlesRepository.find({ where: { status: 'published' }, order: { id: 'ASC' } });
    if (all.length === 0) return null;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
    const index = hashDateToIndex(today, all.length);
    return this.toPublic(all[index]);
  }

  async getPuzzleEntity(id: number): Promise<Puzzle> {
    const puzzle = await this.puzzlesRepository.findOneBy({ id });
    if (!puzzle) throw new NotFoundException('Puzzle not found');
    return puzzle;
  }

  private assertAccessible(puzzle: Puzzle, hasPremium: boolean): void {
    if (puzzle.isPremium && !hasPremium) {
      throw new ForbiddenException('This is a premium-only puzzle.');
    }
  }

  // Legal moves at a given ply of the puzzle — lets the frontend reuse the same
  // Board.tsx component (and its real drag/click/highlighting) that live games use,
  // rather than a separate bespoke puzzle board. Showing every legal move for a
  // puzzle position (not just the solver's own piece) is normal, expected puzzle-UI
  // behavior, same as chess.com/lichess.
  async getLegalMoves(puzzleId: number, moveIndex: number, hasPremium = false): Promise<{ legalMoves: Move[]; board: BoardState; turn: PieceColor }> {
    const puzzle = await this.getPuzzleEntity(puzzleId);
    this.assertAccessible(puzzle, hasPremium);
    const engine = reconstructEngine(puzzle, moveIndex);
    return { legalMoves: engine.getLegalMoves(), board: engine.getBoard(), turn: engine.getCurrentTurn() };
  }

  // --- Admin / review flow ---

  async listPending(): Promise<Puzzle[]> {
    return this.puzzlesRepository.find({ where: { status: 'pending' }, order: { id: 'ASC' } });
  }

  async setStatus(id: number, status: 'published' | 'rejected'): Promise<Puzzle> {
    const puzzle = await this.getPuzzleEntity(id);
    puzzle.status = status;
    return this.puzzlesRepository.save(puzzle);
  }

  async setPremium(id: number, isPremium: boolean): Promise<Puzzle> {
    const puzzle = await this.getPuzzleEntity(id);
    puzzle.isPremium = isPremium;
    return this.puzzlesRepository.save(puzzle);
  }

  async getOrCreatePlayerRating(userId: number): Promise<PlayerPuzzleRating> {
    let row = await this.playerRatingRepository.findOneBy({ userId });
    if (!row) {
      row = this.playerRatingRepository.create({ userId, ...GLICKO2_DEFAULTS });
      row = await this.playerRatingRepository.save(row);
    }
    return row;
  }

  /**
   * Validates a solver's move against the REAL rules engine (not a hardcoded
   * coordinate comparison): reconstructs the position by replaying the solution so
   * far, confirms the submitted move is actually legal there, and that it matches the
   * puzzle's prescribed move for this ply. On success, auto-plays the opponent's
   * scripted reply (if any) and reports whether the whole sequence is now solved. On
   * either a correct-and-complete or an incorrect attempt, updates the puzzle's and
   * (if authenticated) the player's Glicko-2 puzzle ratings — see scoreAttempt.
   */
  async attemptMove(puzzleId: number, userId: number | null, moveIndex: number, move: Move, hasPremium = false): Promise<PuzzleAttemptResult> {
    const puzzle = await this.getPuzzleEntity(puzzleId);
    this.assertAccessible(puzzle, hasPremium);

    if (moveIndex < 0 || moveIndex % 2 !== 0) {
      throw new BadRequestException('moveIndex must be an even index (a solver ply)');
    }
    if (moveIndex >= puzzle.solution.length) {
      throw new BadRequestException('This puzzle has already been fully solved');
    }

    const engine = reconstructEngine(puzzle, moveIndex);
    const expected: Move = puzzle.solution[moveIndex];
    const isLegal = engine.getLegalMoves().some(m => sameMove(m, move));
    const isCorrect = isLegal && sameMove(move, expected);

    if (!isCorrect) {
      await this.scoreAttempt(puzzle, userId, false);
      return { correct: false, solved: false, solutionMove: expected };
    }

    engine.makeMove(expected);
    let nextIndex = moveIndex + 1;
    let opponentMove: Move | undefined;

    if (nextIndex < puzzle.solution.length) {
      const reply: Move = puzzle.solution[nextIndex];
      engine.makeMove(reply); // opponent's scripted reply, auto-played
      opponentMove = reply;
      nextIndex += 1;
    }

    const solved = nextIndex >= puzzle.solution.length;
    if (solved) {
      await this.scoreAttempt(puzzle, userId, true);
    }

    return {
      correct: true,
      solved,
      board: engine.getBoard(),
      turn: engine.getCurrentTurn(),
      nextMoveIndex: nextIndex,
      opponentMove,
    };
  }

  // Treats the attempt as a one-off Glicko-2 "game" between the player and the puzzle
  // (the same approach chess.com/lichess use for adaptive puzzle ratings): a solve is
  // a win for the player and a loss for the puzzle's difficulty rating, and vice
  // versa. Both sides' updates use pre-attempt snapshots, applied together, exactly
  // like two real players' ratings update off each other in rating.service.ts.
  private async scoreAttempt(puzzle: Puzzle, userId: number | null, success: boolean): Promise<void> {
    puzzle.timesAttempted += 1;
    if (success) puzzle.timesSolved += 1;

    const playerRow = userId ? await this.getOrCreatePlayerRating(userId) : null;
    // An anonymous solver is treated as a nominal average player for the purpose of
    // calibrating the puzzle's own difficulty rating — still useful aggregate signal,
    // even though there's no per-user rating to persist for them.
    const opponentSnapshot = playerRow
      ? { rating: playerRow.rating, ratingDeviation: playerRow.ratingDeviation }
      : { rating: GLICKO2_DEFAULTS.rating, ratingDeviation: GLICKO2_DEFAULTS.ratingDeviation };

    const puzzleSnapshot = { rating: puzzle.rating, ratingDeviation: puzzle.ratingDeviation, volatility: puzzle.volatility };

    const puzzleNew = updateRating(puzzleSnapshot, [{ ...opponentSnapshot, score: success ? 0 : 1 }]);
    puzzle.rating = puzzleNew.rating;
    puzzle.ratingDeviation = puzzleNew.ratingDeviation;
    puzzle.volatility = puzzleNew.volatility;
    await this.puzzlesRepository.save(puzzle);

    if (playerRow) {
      const playerNew = updateRating(
        { rating: playerRow.rating, ratingDeviation: playerRow.ratingDeviation, volatility: playerRow.volatility },
        [{ rating: puzzleSnapshot.rating, ratingDeviation: puzzleSnapshot.ratingDeviation, score: success ? 1 : 0 }],
      );
      playerRow.rating = playerNew.rating;
      playerRow.ratingDeviation = playerNew.ratingDeviation;
      playerRow.volatility = playerNew.volatility;
      playerRow.puzzlesAttempted += 1;
      await this.playerRatingRepository.save(playerRow);
    }
  }

}
