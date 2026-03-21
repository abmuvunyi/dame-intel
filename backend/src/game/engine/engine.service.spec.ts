import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameVariant } from './engine.service';

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

  describe('International 10x10 Variant', () => {
    let intEngine: DraughtsEngine;

    beforeEach(() => {
      intEngine = new DraughtsEngine(GameVariant.INTERNATIONAL_10X10);
    });

    it('should initialize a 10x10 board with 4 rows of pieces', () => {
      expect(intEngine.BOARD_SIZE).toBe(10);
      const board = intEngine.getBoard();

      // Top 4 rows should have dark pieces on valid squares
      expect(board[3][0]?.color).toBe(PieceColor.DARK);
      expect(board[3][1]).toBeNull();

      // Empty rows in the middle
      expect(board[4][0]).toBeNull();
      expect(board[5][0]).toBeNull();

      // Bottom 4 rows should have light pieces
      expect(board[6][1]?.color).toBe(PieceColor.LIGHT);
      expect(board[6][0]).toBeNull();
    });

    it('should allow backwards capturing for Men', () => {
      // Setup a scenario where a Light Man can capture backwards
      const board = Array(10).fill(null).map(() => Array(10).fill(null));
      board[4][5] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[5][4] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark piece behind Light piece

      intEngine.loadBoard(board, PieceColor.LIGHT);

      const moves = intEngine.getLegalMoves();

      // Should find a jump move backwards (down-left since light moves up)
      expect(moves.some(m => m.to.row === 6 && m.to.col === 3)).toBe(true);
    });

    it('should enforce capturing maximum number of pieces', () => {
       const board = Array(10).fill(null).map(() => Array(10).fill(null));

       board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };

       // Path 1: Capture 1 piece
       board[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };

       // Path 2: Capture 2 pieces
       board[4][5] = { color: PieceColor.DARK, type: PieceType.MAN };
       board[2][7] = { color: PieceColor.DARK, type: PieceType.MAN };

       intEngine.loadBoard(board, PieceColor.LIGHT);

       const moves = intEngine.getLegalMoves();

       // Should only offer the path that captures 2 pieces
       expect(moves.length).toBe(1);
       expect(moves[0].captured?.length).toBe(2);
       expect(moves[0].to.row).toBe(1);
       expect(moves[0].to.col).toBe(8);
    });

    it('should support Flying Kings', () => {
      const board = Array(10).fill(null).map(() => Array(10).fill(null));
      board[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING };

      intEngine.loadBoard(board, PieceColor.LIGHT);

      const moves = intEngine.getLegalMoves();

      // Should find moves across the entire diagonal
      expect(moves.some(m => m.to.row === 8 && m.to.col === 1)).toBe(true);
      expect(moves.some(m => m.to.row === 0 && m.to.col === 9)).toBe(true);
      expect(moves.length).toBe(9); // 9 empty squares on that diagonal
    });
  });

});
