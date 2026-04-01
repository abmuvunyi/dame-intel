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

import { GameVariant } from './engine.service';

describe('DraughtsEngine - International Variant', () => {
  let engine: DraughtsEngine;

  beforeEach(async () => {
    engine = new DraughtsEngine(GameVariant.INTERNATIONAL);
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
    expect(engine.variant).toBe(GameVariant.INTERNATIONAL);
  });

  it('should initialize with correct 10x10 board', () => {
    const board = engine.getBoard();

    // Board size should be 10
    expect(board.length).toBe(10);
    expect(board[0].length).toBe(10);

    // Check dark pieces on row 0
    expect(board[0][1]?.color).toBe(PieceColor.DARK);
    expect(board[0][0]).toBeNull();

    // Check light pieces on row 9
    expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
    expect(board[9][1]).toBeNull();

    // Check that there are 4 rows of pieces
    expect(board[3][0]?.color).toBe(PieceColor.DARK); // Row 3 should have dark pieces
    expect(board[6][1]?.color).toBe(PieceColor.LIGHT); // Row 6 should have light pieces

    // Rows 4 and 5 should be empty
    expect(board[4][1]).toBeNull();
    expect(board[5][0]).toBeNull();
  });

  it('should allow valid opening move for light on 10x10', () => {
    const legalMoves = engine.getLegalMoves();
    expect(legalMoves.length).toBeGreaterThan(0);

    // Move piece from row 6 to row 5
    const move = { from: { row: 6, col: 1 }, to: { row: 5, col: 0 } };
    const moved = engine.makeMove(move);
    expect(moved).toBe(true);

    // Piece moved
    expect(engine.getBoard()[5][0]?.color).toBe(PieceColor.LIGHT);
    expect(engine.getBoard()[6][1]).toBeNull();

    // Turn changed
    expect(engine.getCurrentTurn()).toBe(PieceColor.DARK);
  });

  it('men should be able to jump backwards in international variant', () => {
    // Setup a specific board state to test backward jumping for a man
    const board = Array(10).fill(null).map(() => Array(10).fill(null));

    // Place a light man
    board[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };

    // Place a dark man behind it diagonally
    board[6][5] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();

    // Should have 1 legal move: jump backwards
    expect(legalMoves.length).toBe(1);

    const jump = legalMoves[0];
    expect(jump.from.row).toBe(5);
    expect(jump.from.col).toBe(4);
    expect(jump.to.row).toBe(7);
    expect(jump.to.col).toBe(6);
    expect(jump.captured).toBeDefined();
    expect(jump.captured?.length).toBe(1);
    expect(jump.captured?.[0].row).toBe(6);
    expect(jump.captured?.[0].col).toBe(5);
  });

  it('kings should be able to jump any distance in international variant', () => {
    // Setup a specific board state to test flying king
    const board = Array(10).fill(null).map(() => Array(10).fill(null));

    // Place a light king
    board[8][1] = { color: PieceColor.LIGHT, type: PieceType.KING };

    // Place a dark man on the diagonal
    board[4][5] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();

    // The king can jump over the piece at [4,5] and land on [3,6], [2,7], [1,8], or [0,9]
    expect(legalMoves.length).toBe(4);

    // Verify one of the valid landing spots
    const hasLongJump = legalMoves.some(m => m.to.row === 1 && m.to.col === 8);
    expect(hasLongJump).toBe(true);
  });

  it('kings should be able to move any distance without jumping', () => {
    // Setup a specific board state to test flying king movement
    const board = Array(10).fill(null).map(() => Array(10).fill(null));

    // Place a light king in the corner
    board[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING };

    engine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();

    // The king can move to any square on the main diagonal
    expect(legalMoves.length).toBe(9);

    // Check furthest move
    const hasFarMove = legalMoves.some(m => m.to.row === 0 && m.to.col === 9);
    expect(hasFarMove).toBe(true);
  });
});
