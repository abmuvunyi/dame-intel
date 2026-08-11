import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PuzzleRushService } from './puzzle-rush.service';
import { PuzzlesService } from './puzzles.service';
import { Puzzle } from './puzzle.entity';
import { PlayerPuzzleRating } from './player-puzzle-rating.entity';
import { PuzzleRushSession } from './puzzle-rush-session.entity';
import { PieceColor, PieceType, BoardState, Move } from '../game/engine/engine.service';

function emptyBoard(size: number): BoardState {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}

describe('PuzzleRushService', () => {
  let rushService: PuzzleRushService;
  let puzzlesService: PuzzlesService;
  let sessionRepo: any;

  async function seedPuzzle(difficulty: number, move: Move) {
    const board = emptyBoard(8);
    board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    if (move.captured?.length) {
      board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };
    }
    return (puzzlesService as any).puzzlesRepository.save(
      (puzzlesService as any).puzzlesRepository.create({ difficulty, boardSize: 8, board, turnToMove: 'L', solution: [move] }),
    );
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite', database: ':memory:',
          entities: [Puzzle, PlayerPuzzleRating, PuzzleRushSession],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Puzzle, PlayerPuzzleRating, PuzzleRushSession]),
      ],
      providers: [PuzzleRushService, PuzzlesService],
    }).compile();

    rushService = module.get<PuzzleRushService>(PuzzleRushService);
    puzzlesService = module.get<PuzzlesService>(PuzzlesService);
    sessionRepo = (rushService as any).sessionsRepository;

    // A pool of easy puzzles to draw from (onModuleInit's default seed also runs,
    // adding a few more of difficulty 1-3 — harmless, just extra pool depth).
    for (let i = 0; i < 3; i++) {
      await seedPuzzle(1, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] });
    }
  });

  it('starts a session with a first puzzle and (close to) the full time remaining', async () => {
    const session = await rushService.start(null, 180);
    expect(session.sessionId).toBeDefined();
    expect(session.puzzle).toBeDefined();
    expect(session.timeLeftSeconds).toBeGreaterThan(179);
    expect(session.timeLeftSeconds).toBeLessThanOrEqual(180);
  });

  it('increases score and streak on a correct solve, and serves a new puzzle', async () => {
    const session = await rushService.start(null, 180);
    const move = { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } };

    const result = await rushService.attempt(session.sessionId, 0, move);

    expect(result.correct).toBe(true);
    expect(result.ended).toBe(false);
    expect(result.streak).toBe(1);
    expect(result.bestStreak).toBe(1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.nextPuzzle).toBeDefined();
  });

  it('resets streak (but does not end the run) on a wrong answer', async () => {
    const session = await rushService.start(null, 180);

    // Correct first, to build a streak...
    await rushService.attempt(session.sessionId, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } });
    const midSession = await rushService.getSession(session.sessionId);
    expect(midSession.streak).toBe(1);

    // ...then get it wrong.
    const wrongResult = await rushService.attempt(session.sessionId, 0, { from: { row: 5, col: 4 }, to: { row: 4, col: 5 } });

    expect(wrongResult.correct).toBe(false);
    expect(wrongResult.ended).toBe(false);
    expect(wrongResult.streak).toBe(0);
    expect(wrongResult.bestStreak).toBe(1); // best streak is remembered even after a reset
    expect(wrongResult.nextPuzzle).toBeDefined(); // Storm mode: keeps going, doesn't end the run
  });

  it('ends the run once the server-computed time is up, regardless of correctness', async () => {
    const session = await rushService.start(null, 180);
    // Backdate startedAt well past the duration, simulating real elapsed time without
    // waiting — the same technique used for the game clock tests in Phase 5.
    const row = await sessionRepo.findOneBy({ id: session.sessionId });
    row.startedAt = new Date(Date.now() - 200_000);
    await sessionRepo.save(row);

    const result = await rushService.attempt(session.sessionId, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } });

    expect(result.ended).toBe(true);
    expect(result.timeLeftSeconds).toBe(0);
  });

  it('rejects further attempts on an already-ended session', async () => {
    const session = await rushService.start(null, 180);
    const row = await sessionRepo.findOneBy({ id: session.sessionId });
    row.startedAt = new Date(Date.now() - 200_000);
    await sessionRepo.save(row);
    await rushService.attempt(session.sessionId, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } }); // ends it

    await expect(
      rushService.attempt(session.sessionId, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requests a harder puzzle difficulty once the streak crosses the step threshold', async () => {
    await seedPuzzle(2, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] });
    await seedPuzzle(2, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] });
    await seedPuzzle(2, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] });

    const session = await rushService.start(null, 180);
    const spy = jest.spyOn(puzzlesService, 'getRandomPuzzle');

    // 3 correct in a row crosses DIFFICULTY_STEP_STREAK (3) -> the 4th request should ask for difficulty 2.
    for (let i = 0; i < 3; i++) {
      await rushService.attempt(session.sessionId, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } });
    }

    const difficultiesRequested = spy.mock.calls.map(c => c[0]);
    expect(difficultiesRequested).toContain(2);
  });
});
