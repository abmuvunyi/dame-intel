const { DraughtsEngine, PieceColor, PieceType } = require('./dist/src/game/engine/engine.service');

const engine = new DraughtsEngine({ boardSize: 8 });

const board = Array(8).fill(null).map(() => Array(8).fill(null));
board[2][2] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Light man on row 2
// Enemy behind it
board[3][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Enemy

engine.loadBoard(board, PieceColor.LIGHT);
const moves = engine.getLegalMoves();
console.log("8x8 Light Man jumps backward:");
console.log(moves);
