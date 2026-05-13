const { DraughtsEngine, PieceColor, PieceType } = require('./dist/src/game/engine/engine.service');

const engine = new DraughtsEngine({ boardSize: 10 });

const board = Array(10).fill(null).map(() => Array(10).fill(null));
board[5][5] = { color: PieceColor.LIGHT, type: PieceType.KING };
board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN };

engine.loadBoard(board, PieceColor.LIGHT);
const moves = engine.getLegalMoves();
console.log("10x10 King jumps:", moves.length);
if (moves.length > 0) {
    console.log("10x10 King jump sample:", moves[0]);
    console.log("10x10 King jump 2:", moves[1]);
}
