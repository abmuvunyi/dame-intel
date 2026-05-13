const { DraughtsEngine, PieceColor, PieceType } = require('./dist/src/game/engine/engine.service');

const engine = new DraughtsEngine({ boardSize: 8 });

const board = Array(8).fill(null).map(() => Array(8).fill(null));
board[2][2] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Light man on row 2
board[1][1] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark man to jump over on row 1
board[1][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark man on row 1

// We can jump from [2,2] over [1,1] to [0,0]
// Once at [0,0], if another piece is at [1,1] (say it was dark man)
// But let's set up a multi jump that hits promotion row then leaves it
board[2][2] = { color: PieceColor.LIGHT, type: PieceType.MAN };
board[1][1] = { color: PieceColor.DARK, type: PieceType.MAN };
// Empty at 0,0
// Put a piece at 1,-1 (invalid), so let's jump the other way
board[2][4] = { color: PieceColor.LIGHT, type: PieceType.MAN };
board[1][5] = { color: PieceColor.DARK, type: PieceType.MAN };
// jump to [0,6]
// Then if there is a dark man at [1,7], we could jump to [2,8] (invalid)
// So let's do: jump from [2,2] to [0,4]
board[2][2] = { color: PieceColor.LIGHT, type: PieceType.MAN };
board[1][3] = { color: PieceColor.DARK, type: PieceType.MAN };
// jumps to 0,4.
// From 0,4, we want a piece at 1,5 so we can jump to 2,6.
board[1][5] = { color: PieceColor.DARK, type: PieceType.MAN };
// in standard draughts, men can only capture forwards anyway,
// but wait! Can men capture backwards in 8x8? No!
// 10x10 men capture backward, 8x8 men capture forward.
// But we should verify promotion ends turn immediately.

engine.loadBoard(board, PieceColor.LIGHT);
const moves = engine.getLegalMoves();
console.log("8x8 Light Man jumps:");
moves.forEach(m => {
    if (m.from.row === 2 && m.from.col === 2) {
       console.log(m);
    }
});
