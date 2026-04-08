import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameVariant } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;

  beforeEach(async () => {
    engine = new DraughtsEngine({ variant: GameVariant.STANDARD });
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
  });

  it('should initialize with correct pieces', () => {
    const board = engine.getBoard();

    // Check dark pieces on row 0
    expect(board[0][1]?.color).toBe(PieceColor.DARK);
    expect(board[0][0]).toBeNull();

    // Check light pieces on row 7
    expect(board[7][0]?.color).toBe(PieceColor.LIGHT);
    expect(board[7][1]).toBeNull();

    expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
  });

  it('should prevent invalid moves', () => {
    // Light is trying to move a Dark piece
    const moved = engine.makeMove({ from: { row: 2, col: 1 }, to: { row: 3, col: 0 } });
    expect(moved).toBe(false);
  });

  it('should allow backward jumps for men in INTERNATIONAL variant', () => {
    const intEngine = new DraughtsEngine({ variant: GameVariant.INTERNATIONAL });
    // Set up a board where a light man can jump backwards over a dark man
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Empty square behind it is 3, 2

    intEngine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = intEngine.getLegalMoves();
    const jump = legalMoves.find(m => m.from.row === 5 && m.from.col === 4 && m.to.row === 3 && m.to.col === 2);
    expect(jump).toBeDefined();

    const moved = intEngine.makeMove(jump!);
    expect(moved).toBe(true);
    expect(intEngine.getBoard()[3][2]?.color).toBe(PieceColor.LIGHT);
    expect(intEngine.getBoard()[4][3]).toBeNull();
  });

  it('should not allow backward jumps for men in STANDARD variant', () => {
    const stdEngine = new DraughtsEngine({ variant: GameVariant.STANDARD });
    // Set up a board where a light man could jump backwards over a dark man (but shouldn't be allowed)
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    // For light, "forward" is row - 1. So row + 1 is backwards.
    board[2][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    board[3][4] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark man is behind light man
    // Empty square behind the dark man is 4, 5

    stdEngine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = stdEngine.getLegalMoves();
    const jump = legalMoves.find(m => m.from.row === 2 && m.from.col === 3 && m.to.row === 4 && m.to.col === 5);
    expect(jump).toBeUndefined(); // Standard men can't jump backwards
  });

  it('should restrict kings to one step in STANDARD variant', () => {
    const stdEngine = new DraughtsEngine({ variant: GameVariant.STANDARD });
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

    stdEngine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = stdEngine.getLegalMoves();
    // King at 4,4 should have 4 moves (1 step in each diagonal direction)
    expect(legalMoves.length).toBe(4);
    const twoStepMove = legalMoves.find(m => m.to.row === 2 || m.to.row === 6);
    expect(twoStepMove).toBeUndefined();
  });

  it('should allow kings to fly in INTERNATIONAL variant', () => {
    const intEngine = new DraughtsEngine({ variant: GameVariant.INTERNATIONAL });
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

    intEngine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = intEngine.getLegalMoves();
    // Flying king at 4,4 has many moves across the empty board
    expect(legalMoves.length).toBeGreaterThan(4);
    const farMove = legalMoves.find(m => m.to.row === 0 && m.to.col === 0);
    expect(farMove).toBeDefined();
  });

  // Basic move test
  it('should allow valid opening move for light', () => {
    const legalMoves = engine.getLegalMoves();
    expect(legalMoves.length).toBeGreaterThan(0);

    const move = { from: { row: 5, col: 0 }, to: { row: 4, col: 1 } };
    const moved = engine.makeMove(move);
    expect(moved).toBe(true);

    // Piece moved
    expect(engine.getBoard()[4][1]?.color).toBe(PieceColor.LIGHT);
    expect(engine.getBoard()[5][0]).toBeNull();

    // Turn changed
    expect(engine.getCurrentTurn()).toBe(PieceColor.DARK);
  });

});
