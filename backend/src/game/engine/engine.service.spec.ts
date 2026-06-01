import { DraughtsEngine, PieceColor, PieceType, BoardState } from './engine.service';

describe('DraughtsEngine', () => {
  let engine: DraughtsEngine;

  beforeEach(() => {
    engine = new DraughtsEngine();
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
  });

  describe('Standard 8x8 rules', () => {
    it('man captures only forwards in 8x8', () => {
      // Setup a board where a light piece can capture backward
      const customEngine = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
      const board = customEngine.getBoard();
      // Clear board
      for(let r=0; r<8; r++) for(let c=0; c<8; c++) board[r][c] = null;

      board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Forward capture
      board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN }; // Backward capture

      customEngine.loadBoard(board, PieceColor.LIGHT);
      const moves = customEngine.getLegalMoves();

      // Light moves UP (smaller row index), so 3,3 is forward, 5,5 is backward
      // So jumping to 2,2 is forward.
      expect(moves.length).toBe(1);
      expect(moves[0].to).toEqual({ row: 2, col: 2 });
    });
  });

  describe('International 10x10 rules', () => {
    it('man captures forwards and backwards in 10x10', () => {
      // Setup a board where a light piece can capture backward
      const customEngine = new DraughtsEngine({ boardSize: 10, forceMajorityCapture: true });
      const board = customEngine.getBoard();
      // Clear board
      for(let r=0; r<10; r++) for(let c=0; c<10; c++) board[r][c] = null;

      board[4][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Forward capture
      board[5][5] = { color: PieceColor.DARK, type: PieceType.MAN }; // Backward capture

      customEngine.loadBoard(board, PieceColor.LIGHT);
      const moves = customEngine.getLegalMoves();

      // Light moves UP (smaller row index), so 3,3 is forward, 5,5 is backward
      // Should find both jumps
      expect(moves.length).toBe(2);
    });
  });
});
