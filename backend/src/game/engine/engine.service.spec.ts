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

  it('backward jump test in 8x8 standard', () => {
     // Standard checkers 8x8. Regular pieces shouldn't jump backwards.
     const customEngine = new DraughtsEngine({ boardSize: 8 });
     const board = Array(8).fill(null).map(() => Array(8).fill(null));
     board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
     board[5][4] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark piece behind light piece
     customEngine.loadBoard(board, PieceColor.LIGHT);

     const moves = customEngine.getLegalMoves();
     // Should not be able to capture backwards
     expect(moves.filter(m => m.captured && m.captured.length > 0).length).toBe(0);
  });

  it('backward jump test in 10x10 international', () => {
     // International draughts 10x10. Regular pieces CAN jump backwards.
     const customEngine = new DraughtsEngine({ boardSize: 10 });
     const board = Array(10).fill(null).map(() => Array(10).fill(null));
     board[4][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
     board[5][4] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark piece behind light piece
     customEngine.loadBoard(board, PieceColor.LIGHT);

     const moves = customEngine.getLegalMoves();
     // Should be able to capture backwards
     expect(moves.filter(m => m.captured && m.captured.length > 0).length).toBeGreaterThan(0);
  });

});

describe('DraughtsEngine King Rules', () => {
  it('short jump for kings in 8x8 standard', () => {
     const customEngine = new DraughtsEngine({ boardSize: 8 });
     const board = Array(8).fill(null).map(() => Array(8).fill(null));
     board[4][3] = { color: PieceColor.LIGHT, type: PieceType.KING };
     customEngine.loadBoard(board, PieceColor.LIGHT);

     const moves = customEngine.getLegalMoves();
     // Should only be able to move 1 square diagonally (4 moves max)
     expect(moves.length).toBeLessThanOrEqual(4);
     for (const move of moves) {
         expect(Math.abs(move.from.row - move.to.row)).toBe(1);
         expect(Math.abs(move.from.col - move.to.col)).toBe(1);
     }
  });

  it('flying kings in 10x10 international', () => {
     const customEngine = new DraughtsEngine({ boardSize: 10 });
     const board = Array(10).fill(null).map(() => Array(10).fill(null));
     board[4][3] = { color: PieceColor.LIGHT, type: PieceType.KING };
     customEngine.loadBoard(board, PieceColor.LIGHT);

     const moves = customEngine.getLegalMoves();
     // Should be able to move more than 1 square diagonally
     expect(moves.some(move => Math.abs(move.from.row - move.to.row) > 1)).toBe(true);
  });
});
