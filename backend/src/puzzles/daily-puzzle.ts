// Pure, framework-independent daily-puzzle selection — same pattern as streak.ts /
// subscription-status.ts: no NestJS, no I/O, directly unit-testable. Deterministic:
// the same UTC calendar date always maps to the same index into a same-length,
// same-order candidate list, so every visitor on a given day sees the exact same
// puzzle, and refreshing doesn't change it.
export function hashDateToIndex(dateStr: string, modulus: number): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0; // |0 keeps this in 32-bit int range
  }
  return Math.abs(hash) % modulus;
}
