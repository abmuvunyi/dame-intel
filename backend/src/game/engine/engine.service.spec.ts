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

  describe('International 10x10 Rules', () => {
    it('should allow flying king', () => {
        engine = new DraughtsEngine({ boardSize: 10 });
        const board = engine.getBoard();
        for (let r=0; r<10; r++) for (let c=0; c<10; c++) board[r][c] = null;
        engine.loadBoard(board, PieceColor.LIGHT);
        board[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING };
        const moves = engine.getLegalMoves();
        expect(moves.length).toBe(9); // Slide all the way to 0,9
    });
    it('men can capture backwards', () => {
        engine = new DraughtsEngine({ boardSize: 10 });
        const board = engine.getBoard();
        for (let r=0; r<10; r++) for (let c=0; c<10; c++) board[r][c] = null;
        engine.loadBoard(board, PieceColor.LIGHT);
        board[3][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
        board[4][4] = { color: PieceColor.DARK, type: PieceType.MAN };
        const moves = engine.getLegalMoves();
        expect(moves.length).toBe(1);
        expect(moves[0].to).toEqual({ row: 5, col: 5 }); // Down/backwards capture
    });
  });

  describe('Standard 8x8 Rules', () => {
    it('men cannot capture backwards', () => {
        engine = new DraughtsEngine({ boardSize: 8 });
        const board = engine.getBoard();
        for (let r=0; r<8; r++) for (let c=0; c<8; c++) board[r][c] = null;
        engine.loadBoard(board, PieceColor.LIGHT);
        board[3][3] = { color: PieceColor.LIGHT, type: PieceType.MAN };
        board[4][4] = { color: PieceColor.DARK, type: PieceType.MAN };
        const moves = engine.getLegalMoves();
        // Since LIGHT moves UP (-1), it shouldn't be able to capture DOWN (+1)
        expect(moves.length).toBe(2); // Should only have normal moves UP
        expect(moves[0].to.row).toBe(2);
    });
    it('kings are short range', () => {
        engine = new DraughtsEngine({ boardSize: 8 });
        const board = engine.getBoard();
        for (let r=0; r<8; r++) for (let c=0; c<8; c++) board[r][c] = null;
        engine.loadBoard(board, PieceColor.LIGHT);
        board[7][0] = { color: PieceColor.LIGHT, type: PieceType.KING };
        const moves = engine.getLegalMoves();
        expect(moves.length).toBe(1); // Only 1 step, not 7!
    });
  });
});
