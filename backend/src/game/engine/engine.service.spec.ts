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

  it('should prevent 8x8 Men from jumping backwards', () => {
    // Empty board
    const emptyBoard = Array(8).fill(null).map(() => Array(8).fill(null));

    // Light man at row 4, col 4. Dark man at row 5, col 5 (behind Light man)
    emptyBoard[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    emptyBoard[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(emptyBoard, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();

    // Light moves UP (towards row 0). So moving to row 5 is backwards.
    // It should have 0 legal jumps, and only normal forward moves (to 3,3 and 3,5).
    const jumpMoves = legalMoves.filter(m => m.captured && m.captured.length > 0);
    expect(jumpMoves.length).toBe(0);
  });

  it('should prevent 8x8 Kings from flying', () => {
    const emptyBoard = Array(8).fill(null).map(() => Array(8).fill(null));

    // Light King at 4,4 with empty board
    emptyBoard[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

    engine.loadBoard(emptyBoard, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();

    // In 8x8, King can only move 1 square. From 4,4, it can move to 3,3; 3,5; 5,3; 5,5 (4 total).
    expect(legalMoves.length).toBe(4);
  });

  it('should stop 8x8 Men from continuing to jump after reaching the promotion row', () => {
    const emptyBoard = Array(8).fill(null).map(() => Array(8).fill(null));

    // Light man at 2,2. Dark men at 1,1 and 1,5.
    // Jump 1: 2,2 jumps over 1,1 to land on 0,0 (promotion row)
    // There is another Dark man at 1,5 (if it was a king, it could theoretically fly over to capture it after bouncing off 0,0, but in 8x8 men turn ends immediately).
    // Let's setup a clear multi-jump path that lands on row 0.

    // Light at 2,4. Dark at 1,3. Land at 0,2 (Promotion!).
    // Is there a sub-jump from 0,2? Let's put a dark piece at 1,1.
    // If it was a 10x10 man (who can jump backwards) or King, it could jump from 0,2 over 1,1 to 2,0.
    // But since it's an 8x8 man, its turn must end at 0,2.

    emptyBoard[2][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    emptyBoard[1][3] = { color: PieceColor.DARK, type: PieceType.MAN };
    emptyBoard[1][1] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(emptyBoard, PieceColor.LIGHT);
    const legalMoves = engine.getLegalMoves();

    // Only 1 jump sequence possible: 2,4 -> 0,2 capturing 1,3.
    expect(legalMoves.length).toBe(1);
    expect(legalMoves[0].captured?.length).toBe(1);
    expect(legalMoves[0].to.row).toBe(0);
    expect(legalMoves[0].to.col).toBe(2);
  });

  it('should allow 10x10 Men to jump backwards', () => {
    const engine10x10 = new DraughtsEngine({ boardSize: 10 });
    const emptyBoard = Array(10).fill(null).map(() => Array(10).fill(null));

    // Light man at row 4, col 4. Dark man at row 5, col 5 (behind Light man)
    emptyBoard[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    emptyBoard[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine10x10.loadBoard(emptyBoard, PieceColor.LIGHT);

    const legalMoves = engine10x10.getLegalMoves();

    // In 10x10, Light moves UP. So moving to row 6 is backwards.
    // It should jump over 5,5 to land at 6,6.
    const jumpMoves = legalMoves.filter(m => m.captured && m.captured.length > 0);
    expect(jumpMoves.length).toBe(1);
    expect(jumpMoves[0].to.row).toBe(6);
    expect(jumpMoves[0].to.col).toBe(6);
  });

  it('should allow 10x10 Kings to fly', () => {
    const engine10x10 = new DraughtsEngine({ boardSize: 10 });
    const emptyBoard = Array(10).fill(null).map(() => Array(10).fill(null));

    // Light King at 4,4 with empty board
    emptyBoard[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

    engine10x10.loadBoard(emptyBoard, PieceColor.LIGHT);

    const legalMoves = engine10x10.getLegalMoves();

    // In 10x10, King can move to any empty square along its diagonals.
    // Diagonal 1 (top-left to bottom-right): 0,0; 1,1; 2,2; 3,3; [4,4]; 5,5; 6,6; 7,7; 8,8; 9,9 -> 9 squares
    // Diagonal 2 (bottom-left to top-right): 8,0; 7,1; 6,2; 5,3; [4,4]; 3,5; 2,6; 1,7; 0,8 -> 8 squares
    // Total moves = 17
    expect(legalMoves.length).toBe(17);
  });

});
