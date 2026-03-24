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

describe('DraughtsEngine - International', () => {
  let engine: DraughtsEngine;

  beforeEach(async () => {
    // Note: Have to import GameVariant from engine.service
    const { DraughtsEngine, GameVariant } = require('./engine.service');
    engine = new DraughtsEngine(GameVariant.INTERNATIONAL);
  });

  it('should initialize a 10x10 board with 4 rows of pieces', () => {
    const { PieceColor } = require('./engine.service');
    const board = engine.getBoard();

    expect(engine.BOARD_SIZE).toBe(10);
    expect(board.length).toBe(10);
    expect(board[0].length).toBe(10);

    // Check dark pieces on row 0
    expect(board[0][1]?.color).toBe(PieceColor.DARK);
    expect(board[0][0]).toBeNull();

    // Row 3 should have dark pieces
    expect(board[3][0]?.color).toBe(PieceColor.DARK);

    // Row 4 should be empty
    expect(board[4][1]).toBeNull();

    // Row 5 should be empty
    expect(board[5][0]).toBeNull();

    // Row 6 should have light pieces
    expect(board[6][1]?.color).toBe(PieceColor.LIGHT);

    // Row 9 should have light pieces
    expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
  });

  it('should allow backward capture for men', () => {
    const { PieceColor, PieceType } = require('./engine.service');
    // Setup a scenario where a light man can capture backwards
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[5][5] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece
    board[6][6] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy piece behind us
    // Empty square at 7,7

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(moves.length).toBe(1);
    expect(moves[0].from).toEqual({ row: 5, col: 5 });
    expect(moves[0].to).toEqual({ row: 7, col: 7 });
    expect(moves[0].captured).toEqual([{ row: 6, col: 6 }]);
  });

  it('should allow flying king moves', () => {
    const { PieceColor, PieceType } = require('./engine.service');
    // Setup a scenario where a light king has a clear diagonal
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING }; // King at bottom left

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    // Can move to (8,1), (7,2), (6,3), ..., (0,9) - that's 9 squares
    expect(moves.length).toBe(9);
    expect(moves.some(m => m.to.row === 0 && m.to.col === 9)).toBe(true);
  });

  it('should allow flying king jump and landing anywhere behind', () => {
    const { PieceColor, PieceType } = require('./engine.service');
    // Setup a scenario
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING };
    board[6][3] = { color: PieceColor.DARK, type: PieceType.MAN };
    // The king can jump to (5,4), (4,5), (3,6), (2,7), (1,8), (0,9)

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(moves.length).toBe(6);
    expect(moves.every(m => m.captured?.length === 1)).toBe(true);
    expect(moves.some(m => m.to.row === 0 && m.to.col === 9)).toBe(true);
  });

  it('should enforce the maximum capture sequence rule', () => {
    const { PieceColor, PieceType } = require('./engine.service');
    // Setup a scenario:
    // Jump A captures 1 piece
    // Jump B captures 2 pieces
    // Therefore only Jump B should be legal
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[5][5] = { color: PieceColor.LIGHT, type: PieceType.MAN };

    // Path A: 1 capture
    board[4][4] = { color: PieceColor.DARK, type: PieceType.MAN };
    // lands on 3,3 (empty)

    // Path B: 2 captures
    board[4][6] = { color: PieceColor.DARK, type: PieceType.MAN };
    // lands on 3,7
    board[2][8] = { color: PieceColor.DARK, type: PieceType.MAN };
    // lands on 1,9

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(moves.length).toBe(1);
    expect(moves[0].captured?.length).toBe(2);
    expect(moves[0].to).toEqual({ row: 1, col: 9 });
  });
});
