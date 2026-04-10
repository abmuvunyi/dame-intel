import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;

  beforeEach(async () => {
    engine = new DraughtsEngine();
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

  describe('8x8 Standard Rules', () => {
    it('should not allow Men to capture backwards', () => {
      const standardEngine = new DraughtsEngine({ boardSize: 8 });
      const board = Array(8).fill(null).map(() => Array(8).fill(null));

      // Light man at 4,3
      board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man at 5,4 (behind Light man)
      board[5][4] = { color: PieceColor.DARK, type: PieceType.MAN };

      standardEngine.loadBoard(board, PieceColor.LIGHT);

      const legalMoves = standardEngine.getLegalMoves();
      // Should not find any jump backwards to 6,5
      const captures = legalMoves.filter(m => m.captured && m.captured.length > 0);
      expect(captures.length).toBe(0);
    });

    it('should restrict Kings to non-flying movement', () => {
      const standardEngine = new DraughtsEngine({ boardSize: 8 });
      const board = Array(8).fill(null).map(() => Array(8).fill(null));

      // Light king at 4,4
      board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

      standardEngine.loadBoard(board, PieceColor.LIGHT);

      const legalMoves = standardEngine.getLegalMoves();
      // A non-flying king at 4,4 should have exactly 4 valid moves (adjacent diagonals)
      expect(legalMoves.length).toBe(4);

      const toPositions = legalMoves.map(m => `${m.to.row},${m.to.col}`);
      expect(toPositions).toContain('3,3');
      expect(toPositions).toContain('3,5');
      expect(toPositions).toContain('5,3');
      expect(toPositions).toContain('5,5');
      // Should not contain distance moves
      expect(toPositions).not.toContain('2,2');
    });
  });

  describe('10x10 International Rules', () => {
    it('should allow Men to capture backwards', () => {
      const intlEngine = new DraughtsEngine({ boardSize: 10 });
      const board = Array(10).fill(null).map(() => Array(10).fill(null));

      // Light man at 4,3
      board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man at 5,4 (behind Light man)
      board[5][4] = { color: PieceColor.DARK, type: PieceType.MAN };

      intlEngine.loadBoard(board, PieceColor.LIGHT);

      const legalMoves = intlEngine.getLegalMoves();
      const captures = legalMoves.filter(m => m.captured && m.captured.length > 0);
      expect(captures.length).toBeGreaterThan(0);
      expect(captures[0].to.row).toBe(6);
      expect(captures[0].to.col).toBe(5);
    });

    it('should allow Kings to fly', () => {
      const intlEngine = new DraughtsEngine({ boardSize: 10 });
      const board = Array(10).fill(null).map(() => Array(10).fill(null));

      // Light king at 4,4
      board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

      intlEngine.loadBoard(board, PieceColor.LIGHT);

      const legalMoves = intlEngine.getLegalMoves();
      // A flying king at 4,4 on an empty 10x10 board should have many moves
      expect(legalMoves.length).toBeGreaterThan(4);

      const toPositions = legalMoves.map(m => `${m.to.row},${m.to.col}`);
      // Should contain distance moves
      expect(toPositions).toContain('2,2');
      expect(toPositions).toContain('7,7');
    });
  });
});
