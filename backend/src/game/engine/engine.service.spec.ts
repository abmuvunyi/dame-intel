import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameVariant } from './engine.service';

describe('DraughtsEngine', () => {
  describe('Standard Variant', () => {
    let engine: DraughtsEngine;

    beforeEach(async () => {
      engine = new DraughtsEngine(GameVariant.STANDARD);
    });

    it('should be defined', () => {
      expect(engine).toBeDefined();
    });

    it('should initialize with correct pieces on 8x8', () => {
      const board = engine.getBoard();
      expect(board.length).toBe(8);
      expect(board[0].length).toBe(8);

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

  describe('International Variant', () => {
    let engine: DraughtsEngine;

    beforeEach(async () => {
      engine = new DraughtsEngine(GameVariant.INTERNATIONAL);
    });

    it('should initialize with correct pieces on 10x10', () => {
      const board = engine.getBoard();
      expect(board.length).toBe(10);
      expect(board[0].length).toBe(10);

      // Check dark pieces on row 0
      expect(board[0][1]?.color).toBe(PieceColor.DARK);
      expect(board[0][0]).toBeNull();

      // Check light pieces on row 9
      expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
      expect(board[9][1]).toBeNull();

      // Should be 4 rows of pieces (0,1,2,3 and 6,7,8,9)
      expect(board[3][0]?.color).toBe(PieceColor.DARK);
      expect(board[6][1]?.color).toBe(PieceColor.LIGHT);

      expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
    });

    it('should enforce maximum capture rule', () => {
      const board = Array(10).fill(null).map(() => Array(10).fill(null));
      // Light piece at 5,4
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };

      // Option 1: Capture one dark piece at 4,3
      board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };
      // Landing at 3,2

      // Option 2: Capture two dark pieces at 4,5 and 2,7
      board[4][5] = { color: PieceColor.DARK, type: PieceType.MAN };
      // Landing at 3,6
      board[2][7] = { color: PieceColor.DARK, type: PieceType.MAN };
      // Landing at 1,8

      engine.loadBoard(board, PieceColor.LIGHT);

      const moves = engine.getLegalMoves();

      // Should only have the jump sequence that captures 2 pieces
      expect(moves.length).toBe(1);
      expect(moves[0].captured?.length).toBe(2);
      expect(moves[0].to).toEqual({ row: 1, col: 8 });
    });

    it('should allow men to jump backwards', () => {
      const board = Array(10).fill(null).map(() => Array(10).fill(null));
      // Light piece at 5,4
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark piece behind it at 6,5
      board[6][5] = { color: PieceColor.DARK, type: PieceType.MAN };

      engine.loadBoard(board, PieceColor.LIGHT);

      const moves = engine.getLegalMoves();

      // Light piece should be able to jump backwards to 7,6
      expect(moves.length).toBe(1);
      expect(moves[0].to).toEqual({ row: 7, col: 6 });
      expect(moves[0].captured?.length).toBe(1);
      expect(moves[0].captured![0]).toEqual({ row: 6, col: 5 });
    });

    it('should allow flying kings to move multiple squares', () => {
      const board = Array(10).fill(null).map(() => Array(10).fill(null));
      // Light King at 5,4
      board[5][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

      engine.loadBoard(board, PieceColor.LIGHT);

      const moves = engine.getLegalMoves();

      // Should have many moves in all 4 diagonal directions
      expect(moves.length).toBeGreaterThan(4);
      expect(moves.some(m => m.to.row === 1 && m.to.col === 0)).toBe(true); // Up-Left
      expect(moves.some(m => m.to.row === 1 && m.to.col === 8)).toBe(true); // Up-Right
      expect(moves.some(m => m.to.row === 9 && m.to.col === 8)).toBe(true); // Down-Right
      expect(moves.some(m => m.to.row === 9 && m.to.col === 0)).toBe(true); // Down-Left
    });
  });
});
