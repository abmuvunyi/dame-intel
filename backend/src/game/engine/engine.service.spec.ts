import { Test, TestingModule } from '@nestjs/testing';
import { DraughtsEngine, PieceColor, PieceType, GameVariant } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;
  let intEngine: DraughtsEngine;

  beforeEach(async () => {
    engine = new DraughtsEngine();
    intEngine = new DraughtsEngine(GameVariant.INTERNATIONAL);
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
    expect(intEngine).toBeDefined();
  });

  it('should initialize STANDARD with correct pieces', () => {
    const board = engine.getBoard();
    expect(engine.BOARD_SIZE).toBe(8);

    // Check dark pieces on row 0
    expect(board[0][1]?.color).toBe(PieceColor.DARK);
    expect(board[0][0]).toBeNull();

    // Check light pieces on row 7
    expect(board[7][0]?.color).toBe(PieceColor.LIGHT);
    expect(board[7][1]).toBeNull();

    expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
  });

  it('should initialize INTERNATIONAL with correct pieces', () => {
    const board = intEngine.getBoard();
    expect(intEngine.BOARD_SIZE).toBe(10);

    // Check dark pieces on row 0
    expect(board[0][1]?.color).toBe(PieceColor.DARK);
    expect(board[0][0]).toBeNull();

    // Check light pieces on row 9
    expect(board[9][0]?.color).toBe(PieceColor.LIGHT);
    expect(board[9][1]).toBeNull();

    expect(intEngine.getCurrentTurn()).toBe(PieceColor.LIGHT);
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

  it('should enforce strict maximum captures rule in INTERNATIONAL', () => {
    // Custom board setup to test multiple capture paths
    const customBoard = Array(10).fill(null).map(() => Array(10).fill(null));
    customBoard[5][5] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece

    // Path 1: Captures 1 piece
    customBoard[4][6] = { color: PieceColor.DARK, type: PieceType.MAN };
    // Path 2: Captures 2 pieces (backwards capture)
    customBoard[6][4] = { color: PieceColor.DARK, type: PieceType.MAN };
    customBoard[8][2] = { color: PieceColor.DARK, type: PieceType.MAN };

    intEngine.loadBoard(customBoard, PieceColor.LIGHT);
    const legalMoves = intEngine.getLegalMoves();

    // It should only return the move that captures 2 pieces
    expect(legalMoves.length).toBe(1);
    expect(legalMoves[0].captured?.length).toBe(2);
    expect(legalMoves[0].to.row).toBe(9);
    expect(legalMoves[0].to.col).toBe(1);
  });

  it('should allow flying kings in INTERNATIONAL', () => {
    const customBoard = Array(10).fill(null).map(() => Array(10).fill(null));
    customBoard[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING };

    intEngine.loadBoard(customBoard, PieceColor.LIGHT);
    const legalMoves = intEngine.getLegalMoves();

    // King at (9,0) should be able to move to (8,1), (7,2), (6,3), ..., (0,9)
    expect(legalMoves.length).toBe(9);
    expect(legalMoves.find(m => m.to.row === 0 && m.to.col === 9)).toBeDefined();
  });
});
