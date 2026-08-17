// Pure, framework-independent move classification — same design pattern as
// engine.service.ts / matchmaking.ts / swiss-pairing.ts / chat-filter.ts: no NestJS,
// no I/O, directly unit-testable. Phase 11 asked for "explicit, documented
// thresholds", not a statistically-calibrated centipawn-style model, so that's what
// this is.
//
// The input is an "eval delta": how much worse the move actually played was than the
// engine's own top-rated legal move at that position, in the SAME units
// `AiService.evaluateBoard()`/`analyzePosition()` already use (WEIGHT_MAN = 10,
// WEIGHT_KING = 25 — see ai.service.ts). Both numbers come from `analyzePosition()`,
// which evaluates every legal move from the mover's own perspective and sorts
// best-first, so `delta = bestMove.evaluation - playedMove.evaluation` is always >= 0
// (the played move can be the best move, in which case delta is exactly 0, but it can
// never beat it — analyzePosition already considered it as a candidate).
export type MoveClassification = 'BEST' | 'GOOD' | 'INACCURACY' | 'MISTAKE' | 'BLUNDER';

// Thresholds are expressed as "how many WEIGHT_MAN units worse than best", so they
// stay meaningful if the AI's search depth changes (depth affects how accurately the
// engine estimates a position, not the scale these weights are measured in). Picked
// to roughly correspond to real drops in material/positional value:
//   BEST:        matches the engine's own top choice exactly.
//   GOOD:        a small, mostly positional cost — well under half a man's value.
//   INACCURACY:  gives up somewhere between roughly half a man and a full man.
//   MISTAKE:     gives up more than a man, up to about a king's worth (2.5 men).
//   BLUNDER:     gives up more than a king's worth of advantage — a serious error,
//                e.g. hanging a piece to an unanswered multi-capture.
export const CLASSIFICATION_THRESHOLDS = {
  GOOD_MAX: 3,        // 0 < delta <= 3   -> GOOD
  INACCURACY_MAX: 10, // 3 < delta <= 10  -> INACCURACY
  MISTAKE_MAX: 25,    // 10 < delta <= 25 -> MISTAKE
  // delta > 25                          -> BLUNDER
} as const;

export function classifyMove(evalDelta: number): MoveClassification {
  if (evalDelta <= 0) return 'BEST';
  if (evalDelta <= CLASSIFICATION_THRESHOLDS.GOOD_MAX) return 'GOOD';
  if (evalDelta <= CLASSIFICATION_THRESHOLDS.INACCURACY_MAX) return 'INACCURACY';
  if (evalDelta <= CLASSIFICATION_THRESHOLDS.MISTAKE_MAX) return 'MISTAKE';
  return 'BLUNDER';
}

// Simple, explicit, documented accuracy formula (not lichess/chess.com's
// win-probability-based model — deliberately simpler, per the brief's spirit of
// "a simple wordlist filter is fine for now" applied to this phase's own scope):
// each move contributes a fixed credit based on its classification, and accuracy is
// the average credit across every move that player made. A player who played only
// BEST moves scores 100%; one who only blundered scores 0%.
const CLASSIFICATION_CREDIT: Record<MoveClassification, number> = {
  BEST: 100,
  GOOD: 90,
  INACCURACY: 70,
  MISTAKE: 40,
  BLUNDER: 0,
};

// Returns null (not 0) for an empty move list — "no moves played" is a genuinely
// different, undefined case from "played moves and scored 0%", and callers (the
// review service, the frontend) should be able to tell them apart rather than
// display a misleading "0% accuracy" for a side that, say, never got to move.
export function computeAccuracy(classifications: MoveClassification[]): number | null {
  if (classifications.length === 0) return null;
  const total = classifications.reduce((sum, c) => sum + CLASSIFICATION_CREDIT[c], 0);
  return Math.round((total / classifications.length) * 10) / 10; // one decimal place
}
