import { DraughtsEngine, PieceColor, PieceType, BoardState, Move } from './engine.service';

// Rule citations throughout refer to "Annex 1 – Official FMJD rules for international
// draughts" (fmjd.org/docs/Annex_1.pdf), article numbers as printed there, unless
// marked "American variant" — for which the specific numbered source wasn't sourced
// for this task; those tests instead pin down this codebase's documented, deliberate
// simplification (see engine.service.ts's GameRules doc comments).

function emptyBoard(size: number): BoardState {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}

function place(board: BoardState, row: number, col: number, color: PieceColor, type: PieceType = PieceType.MAN) {
  board[row][col] = { color, type };
}

function countPieces(board: BoardState, color: PieceColor): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell && cell.color === color) n++;
  return n;
}

function findMove(moves: Move[], from: [number, number], to: [number, number]): Move | undefined {
  return moves.find(m =>
    m.from.row === from[0] && m.from.col === from[1] &&
    m.to.row === to[0] && m.to.col === to[1],
  );
}

describe('DraughtsEngine: initial setup', () => {
  it('sets up a 10x10 international board with 20 pieces per side and Light to move', () => {
    const engine = DraughtsEngine.createInternational();
    const board = engine.getBoard();
    expect(countPieces(board, PieceColor.LIGHT)).toBe(20);
    expect(countPieces(board, PieceColor.DARK)).toBe(20);
    expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
  });

  it('sets up an 8x8 American board with 12 pieces per side and Light to move', () => {
    const engine = DraughtsEngine.createAmerican();
    const board = engine.getBoard();
    expect(countPieces(board, PieceColor.LIGHT)).toBe(12);
    expect(countPieces(board, PieceColor.DARK)).toBe(12);
    expect(engine.getCurrentTurn()).toBe(PieceColor.LIGHT);
  });
});

describe('DraughtsEngine: default rule derivation per variant', () => {
  it('defaults a 10-square board to international-style rules', () => {
    const rules = new DraughtsEngine({ boardSize: 10 }).getRules();
    expect(rules.variant).toBe('international');
    expect(rules.flyingKings).toBe(true);
    expect(rules.manCaptureBackward).toBe(true);
  });

  it('defaults an 8-square board to American-style rules', () => {
    const rules = new DraughtsEngine({ boardSize: 8 }).getRules();
    expect(rules.variant).toBe('american');
    expect(rules.flyingKings).toBe(false);
    expect(rules.manCaptureBackward).toBe(false);
  });

  it('createInternational() and createAmerican() apply the expected variant', () => {
    expect(DraughtsEngine.createInternational().getRules().variant).toBe('international');
    expect(DraughtsEngine.createAmerican().getRules().variant).toBe('american');
  });
});

describe('DraughtsEngine: legal move generation', () => {
  it('only offers men forward moves, never backward, from the initial position', () => {
    const engine = DraughtsEngine.createInternational();
    const moves = engine.getLegalMoves();
    expect(moves.length).toBeGreaterThan(0);
    // Light moves toward row 0.
    for (const m of moves) expect(m.to.row).toBeLessThan(m.from.row);
  });

  it('lets an international (flying) king slide multiple squares down an open diagonal', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 5, 4, PieceColor.LIGHT, PieceType.KING);
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    // Should be able to fly all the way to (1,0) along the NW diagonal, among others.
    expect(findMove(moves, [5, 4], [4, 3])).toBeDefined();
    expect(findMove(moves, [5, 4], [1, 0])).toBeDefined();
  });

  it('restricts an American (non-flying) king to exactly one square per move', () => {
    const engine = DraughtsEngine.createAmerican();
    const board = emptyBoard(8);
    place(board, 4, 3, PieceColor.LIGHT, PieceType.KING);
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    expect(findMove(moves, [4, 3], [3, 2])).toBeDefined();
    expect(findMove(moves, [4, 3], [2, 1])).toBeUndefined(); // two squares away: not reachable
  });
});

describe('DraughtsEngine: mandatory capture (FMJD 4.2, 5.4.6)', () => {
  it('rejects a non-capturing move when a capture is available', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 9, 4, PieceColor.LIGHT); // can capture
    place(board, 8, 3, PieceColor.DARK);
    // (7,2) left empty as the landing square
    place(board, 9, 8, PieceColor.LIGHT); // could otherwise just step forward
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    expect(moves.every(m => m.captured && m.captured.length > 0)).toBe(true);

    const rejected = engine.makeMove({ from: { row: 9, col: 8 }, to: { row: 8, col: 7 } });
    expect(rejected).toBe(false);
  });
});

describe('DraughtsEngine: maximum-capture-sequence enforcement (FMJD 4.13, 4.14) — international', () => {
  it('scenario A: forces the 2-piece chain over an available 1-piece capture on a different man', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);

    // Piece A: a single 1-piece capture.
    place(board, 9, 0, PieceColor.LIGHT);
    place(board, 8, 1, PieceColor.DARK);
    // (7,2) empty: landing square for A's capture.

    // Piece B: a 2-piece chain capture.
    place(board, 9, 8, PieceColor.LIGHT);
    place(board, 8, 7, PieceColor.DARK);
    // (7,6) empty: intermediate landing.
    place(board, 6, 5, PieceColor.DARK);
    // (5,4) empty: final landing.

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(moves).toHaveLength(1);
    expect(findMove(moves, [9, 8], [5, 4])?.captured).toHaveLength(2);
    expect(findMove(moves, [9, 0], [7, 2])).toBeUndefined();
  });

  it('scenario B: forces the longer chain over a shorter one available to the same flying king', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 4, 5, PieceColor.LIGHT, PieceType.KING);

    // Short branch (NE): a single capture.
    place(board, 3, 6, PieceColor.DARK);
    // (2,7)/(1,8) empty landing choices.

    // Long branch (SW): a 2-piece chain.
    place(board, 5, 4, PieceColor.DARK);
    // (6,3) empty intermediate landing.
    place(board, 7, 2, PieceColor.DARK);
    // (8,1) empty final landing.

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(moves.every(m => m.captured && m.captured.length === 2)).toBe(true);
    expect(findMove(moves, [4, 5], [8, 1])?.captured).toEqual(
      expect.arrayContaining([{ row: 5, col: 4 }, { row: 7, col: 2 }]),
    );
    expect(findMove(moves, [4, 5], [2, 7])).toBeUndefined();
    expect(findMove(moves, [4, 5], [1, 8])).toBeUndefined();
  });

  it('scenario C (FMJD 4.14): when two captures tie for the maximum, both remain legal', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);

    place(board, 9, 2, PieceColor.LIGHT);
    place(board, 8, 3, PieceColor.DARK);
    // (7,4) empty landing for P.

    place(board, 9, 6, PieceColor.LIGHT);
    place(board, 8, 7, PieceColor.DARK);
    // (7,8) empty landing for Q.

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(moves).toHaveLength(2);
    expect(findMove(moves, [9, 2], [7, 4])).toBeDefined();
    expect(findMove(moves, [9, 6], [7, 8])).toBeDefined();
  });
});

describe('DraughtsEngine: flying king "turning a corner" mid-capture (FMJD 4.6)', () => {
  it('continues a capture chain onto a perpendicular diagonal, not just straight ahead', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 5, 4, PieceColor.LIGHT, PieceType.KING);
    place(board, 4, 5, PieceColor.DARK); // first capture, heading NE
    place(board, 3, 8, PieceColor.DARK); // only reachable by turning SE from the (2,7) landing choice
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual({ row: 4, col: 9 });
    expect(moves[0].captured).toEqual(
      expect.arrayContaining([{ row: 4, col: 5 }, { row: 3, col: 8 }]),
    );
  });
});

describe('DraughtsEngine: multi-jump chains (FMJD 4.5)', () => {
  it('captures 2 pieces in one turn with a single man', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 9, 4, PieceColor.LIGHT);
    place(board, 8, 3, PieceColor.DARK);
    // (7,2) intermediate landing.
    place(board, 6, 1, PieceColor.DARK);
    // (5,0) final landing.
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    expect(moves).toHaveLength(1);
    const move = moves[0];
    expect(move.to).toEqual({ row: 5, col: 0 });
    expect(move.captured).toEqual(
      expect.arrayContaining([{ row: 8, col: 3 }, { row: 6, col: 1 }]),
    );

    expect(engine.makeMove({ from: { row: 9, col: 4 }, to: { row: 5, col: 0 } })).toBe(true);
    const board2 = engine.getBoard();
    expect(board2[8][3]).toBeNull();
    expect(board2[6][1]).toBeNull();
    expect(board2[5][0]?.color).toBe(PieceColor.LIGHT);
  });
});

describe('DraughtsEngine: king promotion during capture chains (FMJD 3.5, 4.15)', () => {
  it('does NOT promote a man that passes over the promotion row mid-chain but lands elsewhere', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 2, 1, PieceColor.LIGHT);
    place(board, 1, 2, PieceColor.DARK);
    // (0,3) is on Light's promotion row (row 0) — intermediate landing only.
    place(board, 1, 4, PieceColor.DARK);
    // (2,5) final landing, NOT the promotion row.
    engine.loadBoard(board, PieceColor.LIGHT);

    const moves = engine.getLegalMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual({ row: 2, col: 5 });
    expect(moves[0].captured).toHaveLength(2);

    engine.makeMove({ from: { row: 2, col: 1 }, to: { row: 2, col: 5 } });
    expect(engine.getBoard()[2][5]?.type).toBe(PieceType.MAN);
  });

  it('DOES promote a man whose capture chain ends exactly on the promotion row', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 2, 7, PieceColor.LIGHT);
    place(board, 1, 6, PieceColor.DARK);
    // (0,5) final landing IS the promotion row, and nothing further to capture from there.
    engine.loadBoard(board, PieceColor.LIGHT);

    engine.makeMove({ from: { row: 2, col: 7 }, to: { row: 0, col: 5 } });
    expect(engine.getBoard()[0][5]?.type).toBe(PieceType.KING);
  });

  it('also promotes on a plain (non-capturing) move that ends on the promotion row', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 1, 2, PieceColor.LIGHT);
    engine.loadBoard(board, PieceColor.LIGHT);

    engine.makeMove({ from: { row: 1, col: 2 }, to: { row: 0, col: 1 } });
    expect(engine.getBoard()[0][1]?.type).toBe(PieceType.KING);
  });
});

describe('DraughtsEngine: win detection (FMJD 7.2.2, 7.2.3)', () => {
  it('declares the side with legal moves the winner once the other side has none', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 9, 0, PieceColor.LIGHT);
    // No dark pieces on the board at all.
    engine.loadBoard(board, PieceColor.DARK);

    expect(engine.isGameOver()).toBe(true);
    expect(engine.getWinner()).toBe(PieceColor.LIGHT);
  });
});

describe('DraughtsEngine: draw detection', () => {
  // Light's king shuffles between (9,0) and (8,1) (on the row+col=9 diagonal family).
  // Dark's pieces below are deliberately kept off both that diagonal (row+col=9) and
  // Light's other diagonal family (row-col=9 or 7), so no move in these tests ever
  // creates an incidental mandatory capture between the two sides.

  it('FMJD 6.1: declares a draw on threefold repetition of the same position with the same side to move', () => {
    const engine = DraughtsEngine.createInternational();
    const board = emptyBoard(10);
    place(board, 9, 0, PieceColor.LIGHT, PieceType.KING);
    place(board, 0, 7, PieceColor.DARK, PieceType.KING);
    engine.loadBoard(board, PieceColor.LIGHT); // position recorded once here

    const cycle = () => {
      expect(engine.makeMove({ from: { row: 9, col: 0 }, to: { row: 8, col: 1 } })).toBe(true);
      expect(engine.makeMove({ from: { row: 0, col: 7 }, to: { row: 1, col: 6 } })).toBe(true);
      expect(engine.makeMove({ from: { row: 8, col: 1 }, to: { row: 9, col: 0 } })).toBe(true);
      expect(engine.makeMove({ from: { row: 1, col: 6 }, to: { row: 0, col: 7 } })).toBe(true);
    };

    cycle(); // position recorded 2nd time
    expect(engine.isDraw()).toBe(false);

    cycle(); // position recorded 3rd time
    expect(engine.isDraw()).toBe(true);
    expect(engine.getDrawReason()).toBe('threefold-repetition');
  });

  it('FMJD 6.2: declares a draw after N half-moves with no capture and no man move (international)', () => {
    const engine = new DraughtsEngine({ boardSize: 10, drawNoProgressHalfMoves: 4 });
    const board = emptyBoard(10);
    place(board, 9, 0, PieceColor.LIGHT, PieceType.KING);
    place(board, 0, 7, PieceColor.DARK, PieceType.KING);
    engine.loadBoard(board, PieceColor.LIGHT);

    expect(engine.makeMove({ from: { row: 9, col: 0 }, to: { row: 8, col: 1 } })).toBe(true); // 1
    expect(engine.isDraw()).toBe(false);
    expect(engine.makeMove({ from: { row: 0, col: 7 }, to: { row: 1, col: 6 } })).toBe(true); // 2
    expect(engine.makeMove({ from: { row: 8, col: 1 }, to: { row: 9, col: 0 } })).toBe(true); // 3
    expect(engine.isDraw()).toBe(false);
    expect(engine.makeMove({ from: { row: 1, col: 6 }, to: { row: 0, col: 7 } })).toBe(true); // 4
    expect(engine.isDraw()).toBe(true);
    expect(engine.getDrawReason()).toBe('no-progress');
  });

  it('FMJD 6.2: a man move resets the no-progress counter (international)', () => {
    const engine = new DraughtsEngine({ boardSize: 10, drawNoProgressHalfMoves: 4 });
    const board = emptyBoard(10);
    place(board, 9, 0, PieceColor.LIGHT, PieceType.KING);
    place(board, 0, 7, PieceColor.DARK, PieceType.KING);
    place(board, 2, 5, PieceColor.DARK); // a man that can move forward harmlessly, off both of Light's diagonals
    engine.loadBoard(board, PieceColor.LIGHT);

    expect(engine.makeMove({ from: { row: 9, col: 0 }, to: { row: 8, col: 1 } })).toBe(true); // king move, count 1
    expect(engine.makeMove({ from: { row: 2, col: 5 }, to: { row: 3, col: 4 } })).toBe(true); // man move: resets to 0
    expect(engine.makeMove({ from: { row: 8, col: 1 }, to: { row: 9, col: 0 } })).toBe(true); // king move, count 1
    expect(engine.makeMove({ from: { row: 0, col: 7 }, to: { row: 1, col: 6 } })).toBe(true); // king move, count 2
    expect(engine.isDraw()).toBe(false); // only 2 since the reset, not yet at threshold 4
  });

  it('American variant: only a capture resets the no-progress counter, not a man move (documented simplification)', () => {
    const engine = new DraughtsEngine({ boardSize: 8, variant: 'american', drawNoProgressHalfMoves: 3 });
    const board = emptyBoard(8);
    place(board, 5, 0, PieceColor.LIGHT); // shuffles forward, no captures involved
    place(board, 2, 7, PieceColor.DARK);
    engine.loadBoard(board, PieceColor.LIGHT);

    engine.makeMove({ from: { row: 5, col: 0 }, to: { row: 4, col: 1 } }); // man move, 1 (not reset for American)
    engine.makeMove({ from: { row: 2, col: 7 }, to: { row: 3, col: 6 } }); // man move, 2
    expect(engine.isDraw()).toBe(false);
    engine.makeMove({ from: { row: 4, col: 1 }, to: { row: 3, col: 0 } }); // man move, 3 -> threshold
    expect(engine.isDraw()).toBe(true);
    expect(engine.getDrawReason()).toBe('no-progress');
  });
});

describe('DraughtsEngine: American variant divergence from International (same board, two engines)', () => {
  function buildBackwardCaptureBoard(): BoardState {
    const board = emptyBoard(8);
    place(board, 4, 3, PieceColor.LIGHT);
    place(board, 5, 2, PieceColor.DARK);
    // (6,1) empty: landing square for a backward capture.
    return board;
  }

  it('international men may capture backward; American men may not', () => {
    const intl = new DraughtsEngine({ boardSize: 8, variant: 'international' });
    intl.loadBoard(buildBackwardCaptureBoard(), PieceColor.LIGHT);
    expect(findMove(intl.getLegalMoves(), [4, 3], [6, 1])).toBeDefined();

    const american = DraughtsEngine.createAmerican();
    american.loadBoard(buildBackwardCaptureBoard(), PieceColor.LIGHT);
    expect(findMove(american.getLegalMoves(), [4, 3], [6, 1])).toBeUndefined();
  });

  it('American rules require a capture but not the longest one available', () => {
    const engine = DraughtsEngine.createAmerican();
    const board = emptyBoard(8);

    // Piece A (left side of the board): a 1-piece capture that doesn't reach any further.
    place(board, 7, 0, PieceColor.LIGHT);
    place(board, 6, 1, PieceColor.DARK);
    // (5,2) empty landing; nothing further capturable from there.

    // Piece B (right side of the board, kept clear of A's path): a 2-piece chain.
    place(board, 7, 6, PieceColor.LIGHT);
    place(board, 6, 5, PieceColor.DARK);
    // (5,4) intermediate landing.
    place(board, 4, 5, PieceColor.DARK);
    // (3,6) final landing.

    engine.loadBoard(board, PieceColor.LIGHT);
    const moves = engine.getLegalMoves();

    expect(findMove(moves, [7, 0], [5, 2])).toBeDefined(); // the shorter capture stays legal
    expect(findMove(moves, [7, 6], [3, 6])).toBeDefined(); // the longer one is also legal
  });
});

describe('DraughtsEngine: search hygiene', () => {
  it('does not mutate the board as a side effect of computing legal moves', () => {
    const engine = DraughtsEngine.createInternational();
    const before = JSON.stringify(engine.getBoard());
    engine.getLegalMoves();
    engine.getLegalMoves();
    const after = JSON.stringify(engine.getBoard());
    expect(after).toBe(before);
  });

  it('rejects a move that is not among the legal moves at all', () => {
    const engine = DraughtsEngine.createInternational();
    expect(engine.makeMove({ from: { row: 0, col: 0 }, to: { row: 1, col: 1 } })).toBe(false);
  });

  it('loadBoard resets draw-tracking state rather than carrying it over', () => {
    const engine = new DraughtsEngine({ boardSize: 10, drawNoProgressHalfMoves: 2 });
    const board = emptyBoard(10);
    place(board, 9, 0, PieceColor.LIGHT, PieceType.KING);
    place(board, 0, 7, PieceColor.DARK, PieceType.KING);
    engine.loadBoard(board, PieceColor.LIGHT);
    expect(engine.makeMove({ from: { row: 9, col: 0 }, to: { row: 8, col: 1 } })).toBe(true);
    expect(engine.makeMove({ from: { row: 0, col: 7 }, to: { row: 1, col: 6 } })).toBe(true);
    expect(engine.isDraw()).toBe(true); // hit the threshold

    engine.loadBoard(board, PieceColor.LIGHT); // fresh position
    expect(engine.isDraw()).toBe(false);
  });
});
