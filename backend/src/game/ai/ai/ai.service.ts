import { Injectable } from '@nestjs/common';
import { DraughtsEngine, PieceColor, PieceType, Move, BoardState } from '../../engine/engine.service';

const DIAGONAL_NEIGHBOR_OFFSETS = [
  { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
  { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
];

// A score well beyond any realistic material/positional total — used to explicitly
// mark forced wins/losses (see minimax's terminal-node handling) rather than letting
// them fall through to evaluateBoard(), which only measures material/position and has
// no concept of "this side has zero legal moves and has therefore already lost"
// (FMJD 7.2.2). Comfortably dominates any purely material/positional comparison, even
// after the small ply-distance tiebreak below is added to it.
const WIN_SCORE = 100_000;

// A hard ceiling on how many extra plies a still-unresolved forced-capture sequence
// at the search horizon may extend the search by (see quiescence handling in
// minimax) — real capture chains this long are essentially unheard of; this is a
// safety cap, not a target.
const MAX_QUIESCENCE_PLIES = 6;

// Per-difficulty wall-clock budget for getBestMove()'s iterative deepening (see
// below). This is now the primary limiter on how long the AI takes to move — bounds
// worst-case latency to a fixed, difficulty-scaled budget instead of always paying
// the full cost of a hardcoded search depth, which is what made the hardest
// difficulty noticeably slow before.
const DIFFICULTY_TIME_BUDGET_MS: Record<number, number> = {
  1: 200,
  2: 400,
  3: 700,
  4: 1200,
  5: 2000,
  6: 3000,
  7: 4500,
};

// Depth ceilings, roughly the same shape as before this rewrite (still scaling from
// "shallow" to "deep" across the seven levels) but no longer the sole limiter — the
// time budget above will usually cut a search off first. Level 7's ceiling is raised
// from the old fixed depth of 9 since it's the time budget, not this number, that now
// actually bounds how long a level-7 move takes.
const DIFFICULTY_MAX_DEPTH: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 8,
  7: 11,
};

interface TranspositionEntry {
  depth: number;
  value: number;
  flag: 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND';
  bestMove?: Move;
}

// Checking Date.now() on literally every node adds measurable overhead across a deep
// search's node count; checking it every Nth node instead keeps that overhead
// negligible while still noticing a blown deadline promptly.
const DEADLINE_CHECK_INTERVAL_NODES = 512;

// Thrown to unwind out of an in-progress minimax search once its deadline has passed
// (see getBestMove) — caught one level up, at the iterative-deepening loop, which
// then simply keeps the last FULLY completed depth's result rather than trusting
// whatever partial, incomplete evaluation the aborted search had gotten to.
class SearchTimeoutError extends Error {}

@Injectable()
export class AiService {

  // Weights for evaluation function. WEIGHT_MAN and WEIGHT_KING are load-bearing
  // outside this file too — game-review's move-classification.ts thresholds are
  // explicitly calibrated in these exact units ("how many WEIGHT_MAN units worse than
  // best", per its own comment), so changing either number would silently
  // miscalibrate every post-game review's move classifications. Left untouched here.
  private readonly WEIGHT_MAN = 10;
  private readonly WEIGHT_KING = 25;
  private readonly WEIGHT_CENTER = 2; // Bonus for center squares
  private readonly WEIGHT_BACK_ROW = 4; // Bonus for back row defense
  // New terms, deliberately modest — small enough to stay consistent with
  // move-classification.ts's existing assumption that "GOOD is a small, mostly
  // positional cost" (its GOOD_MAX threshold is 3 units; these terms are sized to sit
  // comfortably under that on their own, not to dominate the material terms above).
  private readonly WEIGHT_MOBILITY = 1; // per open diagonal neighbor square
  private readonly WEIGHT_TRAPPED = -3; // a piece with zero open diagonal neighbors at all

  // Cleared at the start of every top-level call (see analyzePosition/getBestMove) —
  // cheap to rebuild, and avoids stale entries from a since-diverged position
  // poisoning a later, unrelated search. getBestMove deliberately does NOT clear it
  // between its own iterative-deepening passes (only once, before the first one) so
  // each deeper pass can reuse the previous depth's entries for move ordering.
  private transpositionTable = new Map<string, TranspositionEntry>();

  // Node counter for the deadline check (see DEADLINE_CHECK_INTERVAL_NODES) — reset
  // per top-level search, incremented once per minimax call.
  private nodesSinceDeadlineCheck = 0;

  // Fixed-depth analysis of every legal move at the current position — used both as
  // the human-facing "engine evaluation" feature (analysis.controller.ts, with a
  // caller-specified depth) and as the building block getBestMove's iterative
  // deepening calls repeatedly at increasing depths. Unbounded by wall-clock time on
  // purpose — a caller asking for a specific depth gets a complete answer at that
  // depth, not a best-effort one (only getBestMove's own internal iteration is
  // time-boxed; see below).
  public analyzePosition(engine: DraughtsEngine, depth: number): { move: Move, evaluation: number }[] {
    this.transpositionTable = new Map();
    return this.searchRoot(engine, depth, null);
  }

  // Iterative deepening with a wall-clock time budget: searches depth 1, then 2, then
  // 3... keeping the best move found by the last FULLY completed depth, until either
  // the difficulty's max depth is reached or its time budget runs out. This bounds
  // worst-case move latency to a fixed, difficulty-scaled budget instead of always
  // paying the full cost of a hardcoded depth — the AI now "thinks for about N
  // seconds", the same shape every real time-aware engine's move selection takes,
  // rather than "thinks until it's done, however long that happens to take".
  //
  // Checking the deadline only between depths (not during one) isn't enough on its
  // own — a single deep iteration on a high-branching-factor position (e.g. a 10x10
  // board's opening) can by itself take far longer than the whole budget. minimax
  // therefore also checks the deadline periodically mid-search and throws
  // SearchTimeoutError to unwind out of that iteration entirely; only a fully
  // completed depth's result is ever kept.
  public getBestMove(engine: DraughtsEngine, difficulty: number): Move | null {
    const maxDepth = DIFFICULTY_MAX_DEPTH[difficulty] || 3;
    const timeBudgetMs = DIFFICULTY_TIME_BUDGET_MS[difficulty] || 700;
    const deadline = Date.now() + timeBudgetMs;

    this.transpositionTable = new Map();

    let bestMove: Move | null = null;

    for (let depth = 1; depth <= maxDepth; depth++) {
      this.nodesSinceDeadlineCheck = 0;
      let evaluations: { move: Move, evaluation: number }[];
      try {
        evaluations = this.searchRoot(engine, depth, deadline);
      } catch (err) {
        if (err instanceof SearchTimeoutError) break; // keep the previous depth's bestMove
        throw err;
      }

      if (evaluations.length === 0) return bestMove;
      bestMove = evaluations[0].move;

      // A confirmed forced win/loss at this depth won't get more "correct" by
      // searching deeper — stop early rather than burning the rest of the budget.
      if (Math.abs(evaluations[0].evaluation) >= WIN_SCORE) break;

      if (Date.now() >= deadline) break;
    }

    // Practically unreachable (depth 1 is trivially fast even under the tightest
    // budget), but a real safety net rather than an assumption: the AI must never
    // simply fail to move because its very first, shallowest search somehow missed
    // the deadline.
    if (!bestMove) {
      const fallbackMoves = engine.getLegalMoves();
      bestMove = fallbackMoves.length > 0 ? fallbackMoves[0] : null;
    }

    return bestMove;
  }

  private searchRoot(engine: DraughtsEngine, depth: number, deadline: number | null): { move: Move, evaluation: number }[] {
    const aiColor = engine.getCurrentTurn();

    const simEngine = new DraughtsEngine(engine.getRules());
    simEngine.loadBoard(this.cloneBoard(engine.getBoard()), aiColor);

    const legalMoves = simEngine.getLegalMoves();
    if (legalMoves.length === 0) return [];

    const rootSig = this.boardSignature(simEngine.getBoard(), aiColor);
    this.orderMoves(legalMoves, this.transpositionTable.get(rootSig)?.bestMove ?? null);

    const evaluations: { move: Move, evaluation: number }[] = [];

    for (const move of legalMoves) {
      const savedBoard = this.cloneBoard(simEngine.getBoard());
      const originalTurn = simEngine.getCurrentTurn();

      simEngine.makeMove(move);
      const ev = this.minimax(simEngine, depth - 1, -Infinity, Infinity, false, aiColor, MAX_QUIESCENCE_PLIES, deadline);
      simEngine.loadBoard(savedBoard, originalTurn);

      evaluations.push({ move, evaluation: ev });
    }

    return evaluations.sort((a, b) => b.evaluation - a.evaluation);
  }

  private minimax(
    engine: DraughtsEngine,
    depth: number,
    alpha: number,
    beta: number,
    maximizingPlayer: boolean,
    aiColor: PieceColor,
    quiescencePliesLeft: number,
    deadline: number | null,
  ): number {
    if (deadline !== null && ++this.nodesSinceDeadlineCheck >= DEADLINE_CHECK_INTERVAL_NODES) {
      this.nodesSinceDeadlineCheck = 0;
      if (Date.now() >= deadline) throw new SearchTimeoutError();
    }

    const originalAlpha = alpha;
    const sig = this.boardSignature(engine.getBoard(), engine.getCurrentTurn());

    const cached = this.transpositionTable.get(sig);
    if (cached && cached.depth >= depth) {
      if (cached.flag === 'EXACT') return cached.value;
      if (cached.flag === 'LOWERBOUND') alpha = Math.max(alpha, cached.value);
      else if (cached.flag === 'UPPERBOUND') beta = Math.min(beta, cached.value);
      if (alpha >= beta) return cached.value;
    }

    const legalMoves = engine.getLegalMoves();

    if (legalMoves.length === 0) {
      if (engine.isDraw()) return 0;
      // FMJD 7.2.2: the side to move with no legal moves has lost. Scored from
      // aiColor's perspective, with a small ply-distance tiebreak so the search
      // prefers a faster forced win / slower forced loss over an equally-certain but
      // more distant one.
      const loserIsAi = engine.getCurrentTurn() === aiColor;
      return (loserIsAi ? -WIN_SCORE : WIN_SCORE) + (loserIsAi ? -depth : depth);
    }
    if (engine.isDraw()) return 0;

    // Forced-capture rule (engine.service.ts) means legalMoves is ALWAYS
    // captures-only whenever any capture exists at all — so this alone identifies
    // "the side to move is mid a forced-capture sequence", no extra lookup needed.
    const inForcedCapture = !!legalMoves[0].captured?.length;

    if (depth <= 0 && !(inForcedCapture && quiescencePliesLeft > 0)) {
      return this.evaluateBoard(engine.getBoard(), aiColor);
    }
    // Otherwise (depth <= 0 but a forced-capture sequence is still unresolved): keep
    // searching, but only through this forced-capture continuation (quiescence
    // search). Stopping cold here is the classic horizon-effect mistake — a capture
    // sequence that started in view but finishes just past the nominal depth would
    // otherwise be scored as if it simply never happened.

    this.orderMoves(legalMoves, cached?.bestMove ?? null);

    const nextDepth = depth > 0 ? depth - 1 : 0;
    // Known simplification: quiescence-extended nodes are always stored/looked-up at
    // `depth: 0` regardless of how much quiescence budget remains, since the
    // transposition key doesn't encode quiescencePliesLeft separately. A shallower
    // quiescence pass could in principle reuse a value computed with a different
    // (and therefore not-quite-comparable) remaining budget. Accepted as a reasonable
    // heuristic trade-off — the `cached.depth >= depth` guard above already prevents
    // a quiescence-only entry from ever being trusted by a genuine deeper search.
    const nextQuiescence = depth > 0 ? quiescencePliesLeft : quiescencePliesLeft - 1;

    let value = maximizingPlayer ? -Infinity : Infinity;
    let bestForNode: Move = legalMoves[0];

    for (const move of legalMoves) {
      const savedBoard = this.cloneBoard(engine.getBoard());
      const originalTurn = engine.getCurrentTurn();

      engine.makeMove(move);
      const ev = this.minimax(engine, nextDepth, alpha, beta, !maximizingPlayer, aiColor, nextQuiescence, deadline);
      engine.loadBoard(savedBoard, originalTurn);

      if (maximizingPlayer) {
        if (ev > value) { value = ev; bestForNode = move; }
        alpha = Math.max(alpha, value);
      } else {
        if (ev < value) { value = ev; bestForNode = move; }
        beta = Math.min(beta, value);
      }
      if (beta <= alpha) break; // Prune
    }

    let flag: TranspositionEntry['flag'] = 'EXACT';
    if (value <= originalAlpha) flag = 'UPPERBOUND';
    else if (value >= beta) flag = 'LOWERBOUND';

    // Depth-based replacement: only overwrite an existing entry with one from a
    // search at least as deep, so a shallow re-probe never evicts a more reliable
    // deeper result already sitting in the table.
    const existing = this.transpositionTable.get(sig);
    if (!existing || existing.depth <= depth) {
      this.transpositionTable.set(sig, { depth, value, flag, bestMove: bestForNode });
    }

    return value;
  }

  // A cached best-move (from this node's own transposition entry, or the previous
  // iterative-deepening pass at the root) goes first — the single highest-leverage
  // move-ordering signal for alpha-beta pruning, since searching the likely-best move
  // first maximizes how often every sibling after it gets pruned outright. Captures
  // are still ordered by size after that (forced-capture rule already means this only
  // matters *within* an all-captures move list, but the order among those still
  // affects pruning efficiency).
  private orderMoves(moves: Move[], preferredMove: Move | null | undefined): void {
    const isSameMove = (a: Move, b: Move) =>
      a.from.row === b.from.row && a.from.col === b.from.col && a.to.row === b.to.row && a.to.col === b.to.col;

    moves.sort((a, b) => {
      if (preferredMove) {
        const aPreferred = isSameMove(a, preferredMove);
        const bPreferred = isSameMove(b, preferredMove);
        if (aPreferred && !bPreferred) return -1;
        if (bPreferred && !aPreferred) return 1;
      }
      return (b.captured?.length || 0) - (a.captured?.length || 0);
    });
  }

  // Deliberately not JSON.parse(JSON.stringify(...)): that round-trip allocates and
  // parses a full string representation of the board on every single search node,
  // which dominated search time at the deeper difficulty levels. A one-level-deep
  // manual clone is both correct (Piece objects can be mutated in place elsewhere —
  // e.g. king promotion in engine.service.ts's makeMove — so a shallow row.slice()
  // that reused the same Piece references would risk one cloned board's promotion
  // silently corrupting another's) and, empirically, several times faster.
  private cloneBoard(board: BoardState): BoardState {
    return board.map(row => row.map(cell => (cell ? { color: cell.color, type: cell.type } : null)));
  }

  private boardSignature(board: BoardState, turn: PieceColor): string {
    let sig: string = turn;
    for (const row of board) {
      for (const cell of row) {
        sig += cell ? cell.color + cell.type : '.';
      }
    }
    return sig;
  }

  public evaluateBoard(board: BoardState, aiColor: PieceColor): number {
    let score = 0;
    const size = board.length;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = board[row][col];
        if (!piece) continue;

        let pieceValue = 0;

        // Material value
        if (piece.type === PieceType.MAN) {
          pieceValue += this.WEIGHT_MAN;
        } else {
          pieceValue += this.WEIGHT_KING;
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

        // Cheap mobility/safety proxy: count this piece's empty diagonal neighbor
        // squares directly, rather than a full rules-aware legal-move count (which
        // would mean constructing and querying a whole engine per piece per leaf
        // node — evaluateBoard is deliberately engine/rules-agnostic and called at
        // every leaf, so it has to stay cheap). A piece with several open diagonals
        // has real options; one with none at all (WEIGHT_TRAPPED) is a liability
        // regardless of its material value. Applies the same near-neighbor check to
        // flying kings too — a coarser approximation for them specifically (their
        // real mobility can extend much further along an open diagonal), but still a
        // meaningful local-safety signal.
        let openNeighbors = 0;
        for (const { dr, dc } of DIAGONAL_NEIGHBOR_OFFSETS) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === null) {
            openNeighbors++;
          }
        }
        pieceValue += openNeighbors * this.WEIGHT_MOBILITY;
        if (openNeighbors === 0) pieceValue += this.WEIGHT_TRAPPED;

        // Add or subtract based on whose piece it is
        if (piece.color === aiColor) {
          score += pieceValue;
        } else {
          score -= pieceValue;
        }
      }
    }

    return score;
  }
}
