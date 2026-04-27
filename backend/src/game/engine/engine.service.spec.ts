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

  it('should restrict 8x8 kings to short-range movement', () => {
    engine = new DraughtsEngine({ boardSize: 8 });
    const board = engine.getBoard();
    // Clear board and add a king in the middle
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) board[r][c] = null;
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    // A short-range king in the middle of an empty board should have exactly 4 normal moves
    expect(moves.length).toBe(4);
  });

  it('should allow 10x10 kings to fly', () => {
    engine = new DraughtsEngine({ boardSize: 10 });
    const board = engine.getBoard();
    for(let r=0; r<10; r++) for(let c=0; c<10; c++) board[r][c] = null;
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    // A flying king on an empty 10x10 board from (4,4) can move to many more squares
    expect(moves.length).toBeGreaterThan(4);
  });

  it('should restrict 8x8 men to forward captures', () => {
    engine = new DraughtsEngine({ boardSize: 8 });
    const board = engine.getBoard();
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) board[r][c] = null;
    // Light man at (4,4)
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    // Dark men behind it at (5,3) and (5,5) - backwards for Light
    board[5][3] = { color: PieceColor.DARK, type: PieceType.MAN };
    board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    // In 8x8, it should not be able to jump backward
    expect(moves.length).toBe(2); // Only normal forward moves
  });

  it('should allow 10x10 men to capture backwards', () => {
    engine = new DraughtsEngine({ boardSize: 10 });
    const board = engine.getBoard();
    for(let r=0; r<10; r++) for(let c=0; c<10; c++) board[r][c] = null;
    // Light man at (4,4)
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    // Dark man behind it at (5,5)
    board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    // In 10x10, it should find the backward jump
    expect(moves.length).toBe(1);
    expect(moves[0].captured).toBeDefined();
    expect(moves[0].captured!.length).toBe(1);
  });
});
