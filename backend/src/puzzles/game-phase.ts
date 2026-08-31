// Pure, framework-independent game-phase classification — same pattern as
// streak.ts / daily-puzzle.ts / move-classification.ts: no NestJS, no I/O, directly
// unit-testable. Built specifically to fix a real content-quality complaint: puzzle
// generation previously produced almost exclusively tiny, sparse endgame-ish
// positions (or hand-authored 2-3-piece toys), never real middlegame material.
// Tagging every generated puzzle with its phase lets generation actively balance
// across all three, and lets a future themed-practice mode filter by phase.
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

// Piece count is expressed as a fraction of the variant's own starting count
// (40 for 10x10 International, 24 for 8x8 American) rather than a hardcoded
// absolute number, so the same thresholds work for both board sizes without
// separate tuning. Thresholds are explicit and documented, not statistically
// derived — the same honest calibration approach every other classifier in this
// codebase (move-classification.ts, anti-cheat's thresholds) already uses.
const OPENING_MIN_FRACTION = 0.75; // more than 3/4 of starting material still on the board
const MIDDLEGAME_MIN_FRACTION = 0.35; // between 35% and 75% — the bulk of real tactical play
// below MIDDLEGAME_MIN_FRACTION -> endgame

export function classifyGamePhase(pieceCount: number, startingPieceCount: number): GamePhase {
  const fraction = pieceCount / startingPieceCount;
  if (fraction > OPENING_MIN_FRACTION) return 'opening';
  if (fraction > MIDDLEGAME_MIN_FRACTION) return 'middlegame';
  return 'endgame';
}
