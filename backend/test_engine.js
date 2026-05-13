const { DraughtsEngine, PieceColor, PieceType } = require('./dist/game/engine/engine.service');

const engine8 = new DraughtsEngine({ boardSize: 8 });
console.log("8x8 rules:", engine8.getRules());

const engine10 = new DraughtsEngine({ boardSize: 10 });
console.log("10x10 rules:", engine10.getRules());
