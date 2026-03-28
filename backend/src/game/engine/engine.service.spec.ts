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

import { GameVariant, BoardState } from './engine.service';

describe('DraughtsEngine - International Rules', () => {
  let engine: DraughtsEngine;

  beforeEach(() => {
    engine = new DraughtsEngine(GameVariant.INTERNATIONAL);
  });

  it('should initialize a 10x10 board with 20 pieces per side', () => {
    const board = engine.getBoard();
    expect(board.length).toBe(10);
    expect(board[0].length).toBe(10);

    let lightCount = 0;
    let darkCount = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const p = board[r][c];
        if (p?.color === PieceColor.LIGHT) lightCount++;
        if (p?.color === PieceColor.DARK) darkCount++;
      }
    }
    expect(lightCount).toBe(20);
    expect(darkCount).toBe(20);
  });

  it('should allow men to capture backwards', () => {
    const board: BoardState = Array(10).fill(null).map(() => Array(10).fill(null));
    // Set up a situation where a light man can only capture backwards
    board[5][5] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    board[6][6] = { color: PieceColor.DARK, type: PieceType.MAN }; // Behind light man

    engine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();
    expect(legalMoves.length).toBe(1);
    expect(legalMoves[0].to.row).toBe(7);
    expect(legalMoves[0].to.col).toBe(7);
  });

  it('should enforce forced maximum capture', () => {
    const board: BoardState = Array(10).fill(null).map(() => Array(10).fill(null));
    // Light piece at 5,5
    board[5][5] = { color: PieceColor.LIGHT, type: PieceType.MAN };

    // Path 1: Capture 1 piece
    board[4][4] = { color: PieceColor.DARK, type: PieceType.MAN };

    // Path 2: Capture 2 pieces backwards
    board[6][6] = { color: PieceColor.DARK, type: PieceType.MAN };
    board[8][6] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(board, PieceColor.LIGHT);

    const legalMoves = engine.getLegalMoves();
    // Should only return the jump sequence with 2 captures
    expect(legalMoves.length).toBe(1);
    expect(legalMoves[0].captured?.length).toBe(2);
    expect(legalMoves[0].to.row).toBe(9);
    expect(legalMoves[0].to.col).toBe(5);
  });

  it('should allow flying kings to jump multiple spaces', () => {
    const board: BoardState = Array(10).fill(null).map(() => Array(10).fill(null));
    board[9][9] = { color: PieceColor.LIGHT, type: PieceType.KING };
    board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(board, PieceColor.LIGHT);
    const legalMoves = engine.getLegalMoves();

    // Can land on 4,4 or 3,3 or 2,2 or 1,1 or 0,0
    expect(legalMoves.length).toBe(5);
    expect(legalMoves.some(m => m.to.row === 4 && m.to.col === 4)).toBe(true);
    expect(legalMoves.some(m => m.to.row === 0 && m.to.col === 0)).toBe(true);
  });
});
