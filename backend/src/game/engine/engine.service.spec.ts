import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, GameVariant, PieceColor, PieceType } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;

  beforeEach(async () => {
    engine = new DraughtsEngine(); // Default STANDARD
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
  });

  it('should initialize STANDARD variant with correct pieces', () => {
    const board = engine.getBoard();

    // Check dark pieces on row 0
    expect(board[0][1]?.color).toBe(PieceColor.DARK);
    expect(board[0][0]).toBeNull();

    // Check light pieces on row 7
    expect(board[7][0]?.color).toBe(PieceColor.LIGHT);
    expect(board[7][1]).toBeNull();

    expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
    expect(engine.getVariant()).toBe(GameVariant.STANDARD);
  });

  it('should initialize INTERNATIONAL variant with 10x10 board', () => {
    const intEngine = new DraughtsEngine(GameVariant.INTERNATIONAL);
    const board = intEngine.getBoard();

    expect(board.length).toBe(10);
    expect(board[0].length).toBe(10);

    // Light starts on rows 6,7,8,9
    expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
    expect(board[9][1]).toBeNull();

    expect(intEngine.getVariant()).toBe(GameVariant.INTERNATIONAL);
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
