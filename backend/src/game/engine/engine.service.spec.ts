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

  it('should support backwards captures in 10x10 International Draughts', () => {
    const internationalEngine = new DraughtsEngine({ boardSize: 10 });

    // Set up a custom board state where a Light man can capture backwards
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[5][5] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece
    board[6][4] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy piece behind us
    board[6][6] = { color: PieceColor.DARK, type: PieceType.MAN }; // Another enemy piece behind us

    internationalEngine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = internationalEngine.getLegalMoves();

    // Should be able to capture backwards to [7][3] or [7][7]
    expect(legalMoves.some(m => m.to.row === 7 && m.to.col === 3)).toBe(true);
    expect(legalMoves.some(m => m.to.row === 7 && m.to.col === 7)).toBe(true);
  });

  it('should end turn immediately on king promotion in 8x8 standard draughts', () => {
    // Standard draughts rules: end turn immediately on promotion
    const standardEngine = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });

    // Set up a custom board state where a Light man can jump into the king row
    // AND there's another jump available if it were to continue as a king
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[2][2] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece
    board[1][1] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy piece
    board[1][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Another enemy piece that could be jumped IF it were a king

    standardEngine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = standardEngine.getLegalMoves();

    // Ensure we don't have a double jump path because the turn should end when reaching row 0
    const doubleJumps = legalMoves.filter(m => m.captured && m.captured.length > 1);
    expect(doubleJumps.length).toBe(0);

    // The legal move should be jumping [1][1] and landing on [0][0]
    const promoteJump = legalMoves.find(m => m.to.row === 0 && m.to.col === 0);
    expect(promoteJump).toBeDefined();
    expect(promoteJump?.captured?.length).toBe(1);
  });
});
