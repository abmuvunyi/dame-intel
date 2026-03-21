import { Injectable } from '@nestjs/common';
import { DraughtsEngine, PieceColor, PieceType, Move, BoardState } from '../../engine/engine.service';

@Injectable()
export class AiService {

  // Weights for evaluation function
  private readonly WEIGHT_MAN = 10;
  private readonly WEIGHT_KING = 25;
  private readonly WEIGHT_FLYING_KING = 35; // Flying Kings are even more powerful
  private readonly WEIGHT_CENTER = 2; // Bonus for center squares
  private readonly WEIGHT_BACK_ROW = 4; // Bonus for back row defense

  public analyzePosition(engine: DraughtsEngine, depth: number): { move: Move, evaluation: number }[] {
    const aiColor = engine.getCurrentTurn();
    const isMaximizingPlayer = true;

    // Deep clone the board
    const cloneBoard = JSON.parse(JSON.stringify(engine.getBoard()));
    const simEngine = new DraughtsEngine(engine.variant);
    simEngine.loadBoard(cloneBoard, aiColor);

    const legalMoves = simEngine.getLegalMoves();
    if (legalMoves.length === 0) return [];

    // Sort moves to improve alpha-beta pruning
    legalMoves.sort((a, b) => (b.captured?.length || 0) - (a.captured?.length || 0));

    const evaluations: { move: Move, evaluation: number }[] = [];

    for (const move of legalMoves) {
      // Simulate move
      const originalState = JSON.stringify(simEngine.getBoard());
      const originalTurn = simEngine.getCurrentTurn();

      simEngine.makeMove(move);

      const ev = this.minimax(simEngine, depth - 1, -Infinity, Infinity, false, aiColor);

      // Revert move
      simEngine.loadBoard(JSON.parse(originalState), originalTurn);

      evaluations.push({ move, evaluation: ev });
    }

    return evaluations.sort((a, b) => b.evaluation - a.evaluation);
  }

  public getBestMove(engine: DraughtsEngine, difficulty: number): Move | null {
    const aiColor = engine.getCurrentTurn();
    const isMaximizingPlayer = true; // AI is always maximizing for its own color in the search root
    const depth = difficulty * 2; // Level 1: depth 2, Level 2: depth 4... Level 4: depth 8

    const evaluations = this.analyzePosition(engine, depth);
    if (evaluations.length === 0) return null;

    // For absolute best move
    return evaluations[0].move;
  }

  private minimax(engine: DraughtsEngine, depth: number, alpha: number, beta: number, maximizingPlayer: boolean, aiColor: PieceColor): number {
    if (depth === 0 || engine.isGameOver()) {
      return this.evaluateBoard(engine.getBoard(), aiColor);
    }

    const legalMoves = engine.getLegalMoves();
    // Sort moves to improve alpha-beta pruning (captures first)
    legalMoves.sort((a, b) => (b.captured?.length || 0) - (a.captured?.length || 0));

    if (maximizingPlayer) {
      let maxEval = -Infinity;
      for (const move of legalMoves) {
        const originalState = JSON.stringify(engine.getBoard());
        const originalTurn = engine.getCurrentTurn();

        engine.makeMove(move);
        const ev = this.minimax(engine, depth - 1, alpha, beta, false, aiColor);
        engine.loadBoard(JSON.parse(originalState), originalTurn);

        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break; // Prune
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of legalMoves) {
        const originalState = JSON.stringify(engine.getBoard());
        const originalTurn = engine.getCurrentTurn();

        engine.makeMove(move);
        const ev = this.minimax(engine, depth - 1, alpha, beta, true, aiColor);
        engine.loadBoard(JSON.parse(originalState), originalTurn);

        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break; // Prune
      }
      return minEval;
    }
  }

  public evaluateBoard(board: BoardState, aiColor: PieceColor): number {
    let score = 0;
    const opponentColor = aiColor === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;

    const size = board.length;
    const isInternational = size === 10;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = board[row][col];
        if (piece) {
          let pieceValue = 0;

          // Material value
          if (piece.type === PieceType.MAN) {
            pieceValue += this.WEIGHT_MAN;
          } else {
            pieceValue += isInternational ? this.WEIGHT_FLYING_KING : this.WEIGHT_KING;
          }

          // Positional value (Center control)
          if (row > 1 && row < size - 2 && col > 1 && col < size - 2) {
            pieceValue += this.WEIGHT_CENTER;
          }

          // Positional value (Back row defense for Men)
          if (piece.type === PieceType.MAN) {
            if (piece.color === PieceColor.LIGHT && row === size - 1) {
               pieceValue += this.WEIGHT_BACK_ROW;
            } else if (piece.color === PieceColor.DARK && row === 0) {
               pieceValue += this.WEIGHT_BACK_ROW;
            }
          }

          // Add or subtract based on whose piece it is
          if (piece.color === aiColor) {
            score += pieceValue;
          } else {
            score -= pieceValue;
          }
        }
      }
    }

    return score;
  }
}