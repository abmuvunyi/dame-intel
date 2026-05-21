import { DraughtsEngine, PieceColor, PieceType } from './engine.service';

describe('DraughtsEngine 8x8 rules', () => {
  it('should end turn immediately on promotion during a multijump sequence for 8x8 standard draughts', () => {
    const engine = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
    // Setup a board where a MAN can capture into the promotion row, but could theoretically jump further if it was a KING
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[2][1] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece
    board[1][2] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy to jump over
    // If it could jump further, there would be another enemy
    // It jumps to [0][3], and then an enemy at [1][4] would be theoretically jumpable IF it became a king immediately and could continue.
    // However, 8x8 standard rules state the turn ends immediately on promotion.
    board[1][4] = { color: PieceColor.DARK, type: PieceType.MAN };

    engine.loadBoard(board, PieceColor.LIGHT);

    const jumps = engine.getLegalMoves();

    // In 8x8, the jump to 0,3 should NOT include a further jump to 2,5
    // Let's check the captured arrays of the legal moves.
    const jumpToPromotion = jumps.find(m => m.to.row === 0 && m.to.col === 3);
    expect(jumpToPromotion).toBeDefined();
    if (jumpToPromotion) {
        expect(jumpToPromotion.captured?.length).toBe(1);
    }
  });

  it('should not allow backwards captures for men in 8x8 standard draughts', () => {
    const engine = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    board[4][1] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece
    board[5][2] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy behind us (row 5 is 'down' towards our starting side)

    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();

    // Light man shouldn't be able to capture backwards towards row 6
    const backwardsJump = moves.find(m => m.to.row === 6 && m.to.col === 3);
    expect(backwardsJump).toBeUndefined();
  });

  it('should allow backwards captures for men in 10x10 international draughts', () => {
    const engine = new DraughtsEngine({ boardSize: 10, forceMajorityCapture: false });
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    board[4][1] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece
    board[5][2] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy behind us

    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();

    const backwardsJump = moves.find(m => m.to.row === 6 && m.to.col === 3);
    expect(backwardsJump).toBeDefined();
  });

  it('should have flying kings in 10x10 but not in 8x8', () => {
    const engine8 = new DraughtsEngine({ boardSize: 8, forceMajorityCapture: false });
    const board8 = Array(8).fill(null).map(() => Array(8).fill(null));
    board8[7][0] = { color: PieceColor.LIGHT, type: PieceType.KING }; // King
    engine8.loadBoard(board8, PieceColor.LIGHT);
    let moves = engine8.getLegalMoves();
    // 8x8 kings move 1 square
    expect(moves.some(m => m.to.row === 5 && m.to.col === 2)).toBe(false);

    const engine10 = new DraughtsEngine({ boardSize: 10, forceMajorityCapture: false });
    const board10 = Array(10).fill(null).map(() => Array(10).fill(null));
    board10[9][0] = { color: PieceColor.LIGHT, type: PieceType.KING }; // King
    engine10.loadBoard(board10, PieceColor.LIGHT);
    moves = engine10.getLegalMoves();
    // 10x10 kings can fly
    expect(moves.some(m => m.to.row === 7 && m.to.col === 2)).toBe(true);
  });
});
