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

});

  it('10x10 King flying', () => {
    const e = new DraughtsEngine({ boardSize: 10, forceMajorityCapture: false });
    // Empty board
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[0][0] = { color: PieceColor.LIGHT, type: PieceType.KING };
    e.loadBoard(board, PieceColor.LIGHT);
    const moves = e.getLegalMoves();
    // 9 squares available to fly to
    expect(moves.length).toBe(9);
  });

  it('8x8 King single step', () => {
    const e = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[0][0] = { color: PieceColor.LIGHT, type: PieceType.KING };
    e.loadBoard(board, PieceColor.LIGHT);
    const moves = e.getLegalMoves();
    // only 1 square available
    expect(moves.length).toBe(1);
    expect(moves[0].to).toEqual({ row: 1, col: 1 });
  });

  it('8x8 Men capture direction', () => {
    const e = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Moves up (-1)
    board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN }; // Behind light piece
    board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // In front of light piece
    e.loadBoard(board, PieceColor.LIGHT);
    const moves = e.getLegalMoves();

    // Light piece should only be able to capture forward, i.e., piece at 3,3
    expect(moves.length).toBe(1);
    expect(moves[0].to).toEqual({ row: 2, col: 2 });
  });

  it('10x10 Men capture direction', () => {
    const e = new DraughtsEngine({ boardSize: 10, forceMajorityCapture: false });
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Moves up (-1)
    board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN }; // Behind light piece
    board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // In front of light piece
    e.loadBoard(board, PieceColor.LIGHT);
    const moves = e.getLegalMoves();

    // Light piece should be able to capture both forward and backward
    expect(moves.length).toBe(2);
  });
