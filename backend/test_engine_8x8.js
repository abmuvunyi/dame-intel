const { DraughtsEngine, PieceColor, PieceType } = require('./dist/src/game/engine/engine.service');

const engine = new DraughtsEngine({ boardSize: 8 });

const board = Array(8).fill(null).map(() => Array(8).fill(null));
// Set up a king and an empty diagonal
board[4][4] = { color: PieceColor.LIGHT, type: PieceType.KING };

engine.loadBoard(board, PieceColor.LIGHT);
const moves = engine.getLegalMoves();
console.log("8x8 King moves:", moves.length);
if (moves.length > 0) {
    console.log("8x8 King move sample:", moves[0]);
}
