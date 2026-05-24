import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameRules, Move, Position } from './engine.service';

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

  describe('8x8 Rules', () => {
      let engine8: DraughtsEngine;
      beforeEach(() => {
          engine8 = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
      });

      it('should only allow forward captures for men', () => {
          const board = engine8.getBoard();
          // Clear board
          for(let r=0; r<8; r++) for(let c=0; c<8; c++) board[r][c] = null;

          board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
          board[5][4] = { color: PieceColor.DARK, type: PieceType.MAN };
          engine8.loadBoard(board, PieceColor.LIGHT);

          const moves = engine8.getLegalMoves();
          // Dark is behind Light (row 5 vs row 4), Light moves UP. So Light cannot capture BACKWARDS.
          expect(moves.some(m => m.captured !== undefined)).toBe(false);
      });
  });

  describe('10x10 International Rules', () => {
      let engine10: DraughtsEngine;
      beforeEach(() => {
          engine10 = new DraughtsEngine({ boardSize: 10, forceMajorityCapture: true });
      });

      it('should allow flying king moves', () => {
          const board = engine10.getBoard();
          for(let r=0; r<10; r++) for(let c=0; c<10; c++) board[r][c] = null;

          board[5][5] = { color: PieceColor.LIGHT, type: PieceType.KING };
          engine10.loadBoard(board, PieceColor.LIGHT);

          const moves = engine10.getLegalMoves();
          // King at 5,5 can move to 0,0 1,1 2,2 3,3 4,4, 6,6 7,7 8,8 9,9, 1,9 2,8 3,7 4,6 6,4 7,3 8,2 9,1
          expect(moves.length).toBeGreaterThan(4);
      });
  });
});
