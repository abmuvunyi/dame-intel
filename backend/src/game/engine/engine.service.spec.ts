import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameVariant } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;

  beforeEach(async () => {
    engine = new DraughtsEngine(GameVariant.STANDARD_8X8);
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

  describe('International 10x10 Variant', () => {
    let intEngine: DraughtsEngine;

    beforeEach(() => {
      intEngine = new DraughtsEngine(GameVariant.INTERNATIONAL_10X10);
    });

    it('should initialize a 10x10 board with 4 rows of pieces', () => {
      const board = intEngine.getBoard();
      expect(board.length).toBe(10);
      expect(board[0].length).toBe(10);

      // Check dark piece on top row
      expect(board[0][1]?.color).toBe(PieceColor.DARK);
      expect(board[0][0]).toBeNull();

      // Check dark piece on 4th row (index 3)
      expect(board[3][0]?.color).toBe(PieceColor.DARK);

      // Empty middle rows
      expect(board[4][1]).toBeNull();
      expect(board[5][0]).toBeNull();

      // Check light piece on 7th row (index 6)
      expect(board[6][1]?.color).toBe(PieceColor.LIGHT);

      // Check light piece on bottom row
      expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
    });
  });
});
