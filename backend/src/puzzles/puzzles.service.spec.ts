import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PuzzlesService } from './puzzles.service';
import { Puzzle } from './puzzle.entity';
import { PlayerPuzzleRating } from './player-puzzle-rating.entity';
import { PieceColor, PieceType, BoardState, Move } from '../game/engine/engine.service';
import { GLICKO2_DEFAULTS } from '../rating/glicko2';

function emptyBoard(size: number): BoardState {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}

// Real in-memory sqlite, same reasoning as rating.service.spec.ts — this exercises
// genuine persistence and, more importantly, genuine engine-backed move validation,
// not a mocked repository standing in for "trust me, it's right".
describe('PuzzlesService', () => {
  let service: PuzzlesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Puzzle, PlayerPuzzleRating],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Puzzle, PlayerPuzzleRating]),
      ],
      providers: [PuzzlesService],
    }).compile();

    service = module.get<PuzzlesService>(PuzzlesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('solution validation (via the real rules engine, not a hardcoded comparison)', () => {
    it('accepts the correct single-move solution and marks the puzzle solved', async () => {
      const board = emptyBoard(8);
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };
      const solutionMove: Move = { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] };

      const puzzle = await (service as any).puzzlesRepository.save(
        (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [solutionMove] }),
      );

      // Client only sends {from, to} — captured is derived server-side from the real
      // engine's legal-move list, proving the match isn't a naive field-by-field diff
      // against a value the client could have tampered with.
      const result = await service.attemptMove(puzzle.id, null, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } });

      expect(result.correct).toBe(true);
      expect(result.solved).toBe(true);
      expect(result.board![3][2]?.color).toBe(PieceColor.LIGHT);
      expect(result.board![4][3]).toBeNull(); // captured piece actually removed
    });

    it('rejects an incorrect move and reveals the correct solution move', async () => {
      const board = emptyBoard(8);
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };
      const solutionMove: Move = { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] };
      const puzzle = await (service as any).puzzlesRepository.save(
        (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [solutionMove] }),
      );

      // A legal move (moving the man forward, not capturing) but not the puzzle's answer.
      const result = await service.attemptMove(puzzle.id, null, 0, { from: { row: 5, col: 4 }, to: { row: 4, col: 5 } });

      expect(result.correct).toBe(false);
      expect(result.solved).toBe(false);
      expect(result.solutionMove).toEqual(solutionMove);
    });

    it('validates a multi-move puzzle by replaying the position, not comparing against the original board', async () => {
      // Solver moves, opponent's scripted reply moves elsewhere, solver moves a SECOND
      // time from where its piece now actually is (4,5) — not its original square
      // (5,4). If the implementation validated against the raw stored board instead of
      // replaying solution[0] first, this second move would look illegal (no piece at
      // 4,5) and this test would fail.
      const board = emptyBoard(8);
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[2][1] = { color: PieceColor.DARK, type: PieceType.MAN };

      const solverMove1: Move = { from: { row: 5, col: 4 }, to: { row: 4, col: 5 } };
      const opponentReply: Move = { from: { row: 2, col: 1 }, to: { row: 3, col: 2 } };
      const solverMove2: Move = { from: { row: 4, col: 5 }, to: { row: 3, col: 4 } };

      const puzzle = await (service as any).puzzlesRepository.save(
        (service as any).puzzlesRepository.create({
          difficulty: 2, boardSize: 8, board, turnToMove: 'L',
          solution: [solverMove1, opponentReply, solverMove2],
        }),
      );

      const first = await service.attemptMove(puzzle.id, null, 0, { from: solverMove1.from, to: solverMove1.to });
      expect(first.correct).toBe(true);
      expect(first.solved).toBe(false); // opponent's reply was auto-played, but the puzzle isn't done
      expect(first.nextMoveIndex).toBe(2);
      expect(first.board![3][2]?.color).toBe(PieceColor.DARK); // the auto-played opponent reply already applied
      expect(first.board![4][5]?.color).toBe(PieceColor.LIGHT); // solver's piece where move1 actually left it

      const second = await service.attemptMove(puzzle.id, null, first.nextMoveIndex!, { from: solverMove2.from, to: solverMove2.to });
      expect(second.correct).toBe(true);
      expect(second.solved).toBe(true);
    });

    it('rejects an odd (non-solver-ply) moveIndex and a moveIndex past the end of the solution', async () => {
      const board = emptyBoard(8);
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      const move: Move = { from: { row: 5, col: 4 }, to: { row: 4, col: 5 } };
      const puzzle = await (service as any).puzzlesRepository.save(
        (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [move] }),
      );

      await expect(service.attemptMove(puzzle.id, null, 1, move)).rejects.toThrow(BadRequestException); // odd index: not a solver ply
      await expect(service.attemptMove(puzzle.id, null, 2, move)).rejects.toThrow(BadRequestException); // past the 1-move solution
    });
  });

  describe('puzzle rating adjustment', () => {
    async function makeSolvablePuzzle() {
      const board = emptyBoard(8);
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };
      const solutionMove: Move = { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] };
      return (service as any).puzzlesRepository.save(
        (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [solutionMove] }),
      );
    }

    it('raises the player rating and lowers the puzzle rating on a correct solve', async () => {
      const puzzle = await makeSolvablePuzzle();
      const before = await service.getOrCreatePlayerRating(42);
      expect(before.rating).toBe(GLICKO2_DEFAULTS.rating);

      await service.attemptMove(puzzle.id, 42, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } });

      const after = await service.getOrCreatePlayerRating(42);
      const puzzleAfter = await service.getPuzzleEntity(puzzle.id);
      expect(after.rating).toBeGreaterThan(before.rating);
      expect(puzzleAfter.rating).toBeLessThan(GLICKO2_DEFAULTS.rating);
      expect(after.puzzlesAttempted).toBe(1);
      expect(puzzleAfter.timesAttempted).toBe(1);
      expect(puzzleAfter.timesSolved).toBe(1);
    });

    it('lowers the player rating and raises the puzzle rating on a failed attempt', async () => {
      const puzzle = await makeSolvablePuzzle();
      const before = await service.getOrCreatePlayerRating(43);

      await service.attemptMove(puzzle.id, 43, 0, { from: { row: 5, col: 4 }, to: { row: 4, col: 5 } }); // wrong move

      const after = await service.getOrCreatePlayerRating(43);
      const puzzleAfter = await service.getPuzzleEntity(puzzle.id);
      expect(after.rating).toBeLessThan(before.rating);
      expect(puzzleAfter.rating).toBeGreaterThan(GLICKO2_DEFAULTS.rating);
      expect(puzzleAfter.timesSolved).toBe(0);
    });

    it('still adjusts the puzzle rating for an anonymous solver, without creating any player rating row', async () => {
      const puzzle = await makeSolvablePuzzle();
      await service.attemptMove(puzzle.id, null, 0, { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } });

      const puzzleAfter = await service.getPuzzleEntity(puzzle.id);
      expect(puzzleAfter.rating).toBeLessThan(GLICKO2_DEFAULTS.rating);

      const anyRatingRows = await (service as any).playerRatingRepository.find();
      expect(anyRatingRows).toHaveLength(0);
    });
  });

  describe('random puzzle selection', () => {
    it('only serves published puzzles, never pending ones', async () => {
      const board = emptyBoard(8);
      const published = (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [], status: 'published' });
      const pending = (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [], status: 'pending' });
      await (service as any).puzzlesRepository.save([published, pending]);

      for (let i = 0; i < 10; i++) {
        const picked = await service.getRandomPuzzle();
        expect(picked!.status).toBe('published');
      }
    });

    it('never includes the solution in what gets served to a client', async () => {
      const board = emptyBoard(8);
      const solutionMove: Move = { from: { row: 5, col: 4 }, to: { row: 3, col: 2 } };
      const puzzle = (service as any).puzzlesRepository.create({ difficulty: 1, boardSize: 8, board, turnToMove: 'L', solution: [solutionMove] });
      await (service as any).puzzlesRepository.save(puzzle);

      const served = await service.getRandomPuzzle();
      expect(served).not.toHaveProperty('solution');
    });
  });

  describe('admin review flow', () => {
    it('lists only pending puzzles, and approving/rejecting changes their status', async () => {
      const board = emptyBoard(8);
      const pending = await (service as any).puzzlesRepository.save(
        (service as any).puzzlesRepository.create({ difficulty: 2, boardSize: 8, board, turnToMove: 'L', solution: [], status: 'pending' }),
      );

      const listed = await service.listPending();
      expect(listed.map(p => p.id)).toContain(pending.id);

      const approved = await service.setStatus(pending.id, 'published');
      expect(approved.status).toBe('published');
      expect((await service.listPending()).map(p => p.id)).not.toContain(pending.id);
    });
  });
});
