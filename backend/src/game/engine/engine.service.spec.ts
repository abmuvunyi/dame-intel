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

  describe('8x8 Specific Rules', () => {
    it('8x8 Short-range Kings: should limit King normal moves to 1 step', () => {
      engine = new DraughtsEngine({ boardSize: 8 });
      const emptyBoard = Array(8).fill(null).map(() => Array(8).fill(null));
      // Place a King in the middle of an empty board
      emptyBoard[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };
      engine.loadBoard(emptyBoard, PieceColor.LIGHT);

      const legalMoves = engine.getLegalMoves();
      expect(legalMoves.length).toBe(4); // Only 1 step in each diagonal direction

      const moveDestinations = legalMoves.map(m => `${m.to.row},${m.to.col}`);
      expect(moveDestinations).toContain('3,3');
      expect(moveDestinations).toContain('3,5');
      expect(moveDestinations).toContain('5,3');
      expect(moveDestinations).toContain('5,5');
    });

    it('8x8 Men forward-only captures: should prevent Men from capturing backwards', () => {
      engine = new DraughtsEngine({ boardSize: 8 });
      const board = Array(8).fill(null).map(() => Array(8).fill(null));

      // Light man at 4,4
      board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man behind it at 5,5 (should not be capturable by Light since Light moves UP)
      board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };
      // Dark man in front of it at 3,3 (capturable)
      board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN };

      engine.loadBoard(board, PieceColor.LIGHT);

      const legalMoves = engine.getLegalMoves();

      expect(legalMoves.length).toBe(1);
      expect(legalMoves[0].to.row).toBe(2);
      expect(legalMoves[0].to.col).toBe(2);
      expect(legalMoves[0].captured).toHaveLength(1);
      expect(legalMoves[0].captured?.[0]).toEqual({ row: 3, col: 3 });
    });

    it('8x8 Men end turn on promotion: jump sequence stops if a Man lands on promotion row', () => {
      engine = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
      const board = Array(8).fill(null).map(() => Array(8).fill(null));

      // Light man at 2,2
      board[2][2] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man at 1,1 (jump to 0,0 - promotion row)
      board[1][1] = { color: PieceColor.DARK, type: PieceType.MAN };
      // Dark man at 1,3 (jump to 0,4 - promotion row)
      board[1][3] = { color: PieceColor.DARK, type: PieceType.MAN };

      // In a normal multi-jump (if it wasn't the promotion row), if there were another piece to jump
      // it would keep going. Let's place a piece that WOULD be jumpable if it were a king
      // If it lands on 0,0, let's place a Dark piece at 1,-1 (invalid anyway).
      // Let's place a piece to jump FROM 0,0 if it were a flying king or moving backwards: Dark piece at 1,1 (already jumped).

      // A better test: Light at 2,2 jumps Dark at 1,3 landing on 0,4.
      // From 0,4, there's a Dark piece at 1,5. If it were a King it could jump to 2,6.
      // But since turn ends on promotion, this subjump should NOT be generated.
      board[1][5] = { color: PieceColor.DARK, type: PieceType.MAN };

      engine.loadBoard(board, PieceColor.LIGHT);

      const legalMoves = engine.getLegalMoves();

      // It can jump 1,1 landing on 0,0 OR jump 1,3 landing on 0,4.
      // Neither should have a subjump.
      expect(legalMoves.length).toBe(2);
      for (const move of legalMoves) {
         expect(move.captured?.length).toBe(1); // No multi-jumps!
      }
    });
  });

  describe('10x10 Specific Rules', () => {
    it('10x10 Flying Kings and backward captures', () => {
      engine = new DraughtsEngine({ boardSize: 10 });
      const board = Array(10).fill(null).map(() => Array(10).fill(null));

      // 10x10 Kings fly
      board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };
      engine.loadBoard(board, PieceColor.LIGHT);

      const kingMoves = engine.getLegalMoves();
      expect(kingMoves.length).toBeGreaterThan(4); // Can slide all the way to edges

      // 10x10 Men capture backwards
      const board2 = Array(10).fill(null).map(() => Array(10).fill(null));
      board2[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      // Dark man behind it at 5,5
      board2[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };
      engine.loadBoard(board2, PieceColor.LIGHT);

      const manMoves = engine.getLegalMoves();
      // Light man (moves UP normally) can jump DOWN (backwards) over 5,5 to 6,6
      expect(manMoves.length).toBe(1);
      expect(manMoves[0].to.row).toBe(6);
      expect(manMoves[0].to.col).toBe(6);
    });
  });
});
