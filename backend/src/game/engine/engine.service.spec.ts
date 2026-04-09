import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameVariant } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;

  describe('Standard Variant', () => {
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

    it('men should only move and jump forward', () => {
      const board = Array(8).fill(null).map(() => Array(8).fill(null));
      // Light man at 4,3
      board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man at 3,4 (forward-right jump available)
      board[3][4] = { color: PieceColor.DARK, type: PieceType.MAN };
      // Dark man at 5,2 (backward-left jump theoretically available if it was international)
      board[5][2] = { color: PieceColor.DARK, type: PieceType.MAN };

      engine.loadBoard(board, PieceColor.LIGHT);
      const legalMoves = engine.getLegalMoves();
      expect(legalMoves.length).toBe(1); // Only the forward jump is allowed
      expect(legalMoves[0].to.row).toBe(2);
      expect(legalMoves[0].to.col).toBe(5);
    });
  });

  describe('International Variant', () => {
    beforeEach(async () => {
      engine = new DraughtsEngine({ variant: GameVariant.INTERNATIONAL });
    });

    it('should initialize a 10x10 board with correct pieces', () => {
      const board = engine.getBoard();
      expect(engine.boardSize).toBe(10);

      // Check dark pieces on row 0
      expect(board[0][1]?.color).toBe(PieceColor.DARK);
      expect(board[0][0]).toBeNull();

      // Check light pieces on row 9
      expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
      expect(board[9][1]).toBeNull();

      expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
    });

    it('men should be able to jump backward', () => {
      const board = Array(10).fill(null).map(() => Array(10).fill(null));
      // Light man at 4,3
      board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man at 5,2 (backward-left for light)
      board[5][2] = { color: PieceColor.DARK, type: PieceType.MAN };

      engine.loadBoard(board, PieceColor.LIGHT);
      const legalMoves = engine.getLegalMoves();
      expect(legalMoves.length).toBe(1);
      expect(legalMoves[0].to.row).toBe(6);
      expect(legalMoves[0].to.col).toBe(1);
    });
  });
});
