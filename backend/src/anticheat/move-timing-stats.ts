// Pure, framework-independent statistics for move-time anomaly detection — same
// design pattern as engine.service.ts / matchmaking.ts / move-classification.ts: no
// NestJS, no I/O, directly unit-testable.
//
// The idea (Phase 12 brief: "flag accounts with unnaturally consistent think-time
// across many games/moves"): real humans have highly variable think-time — fast for
// obvious/forced moves, slow for genuinely hard decisions. A script or bot driven by
// a fixed per-move delay (or none at all) produces think-times clustered tightly
// around one value regardless of position difficulty. The **coefficient of
// variation** (CV = population standard deviation / mean) is the standard way to
// measure "how consistent is this, relative to its own scale" — using raw variance
// alone would be meaningless across players with very different average speeds
// (a fast bullet player and a slow correspondence player can both be perfectly
// natural, just at different absolute timescales; CV normalizes that away).

export interface TimingAnomalyResult {
  coefficientOfVariation: number;
  sampleSize: number;
  isAnomalous: boolean;
}

// Below this many samples, a low CV is just as likely to be "got a fast lucky
// streak" as "this is a bot" — not enough evidence either way. Chosen to require
// meaningfully more than one game's worth of moves (a single ~20-move game could
// still coincidentally look consistent), matching the brief's "across many
// games/moves" framing rather than a single-game snapshot.
export const MIN_SAMPLE_SIZE = 30;

// Below this CV, think-time is "unnaturally consistent". Real human think-time
// distributions typically show CV well above 0.4 (highly skewed — many fast/obvious
// moves, occasional long thinks); a fixed-delay script or a bot with a constant
// "simulate thinking" sleep typically produces CV under 0.1–0.15. 0.15 is set with
// deliberate margin above the "obviously a bot" range, erring toward fewer false
// positives — this only ever produces a review-queue entry, never an automatic
// action (see AnticheatService), so a false positive here costs a moderator a look,
// not a wrongly-banned player.
export const MAX_NATURAL_CV = 0.15;

// A trivial/instant move (e.g. a genuinely forced single-legal-move position, or UI
// click-through lag) isn't a "think" at all — including it would artificially
// deflate variance for every player, cheating or not. Filtering purely on a small
// absolute floor (rather than replaying the game to check the exact legal-move
// count at each position) is a deliberate simplification — see STATUS.md.
export const MIN_MEANINGFUL_THINK_MS = 200;

export function coefficientOfVariation(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean === 0) return null; // avoid divide-by-zero; also not a meaningful sample
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / mean;
}

export function detectTimingAnomaly(rawTimingsMs: number[]): TimingAnomalyResult {
  const samples = rawTimingsMs.filter(t => t >= MIN_MEANINGFUL_THINK_MS);
  const cv = coefficientOfVariation(samples);

  return {
    coefficientOfVariation: cv ?? 0,
    sampleSize: samples.length,
    isAnomalous: cv !== null && samples.length >= MIN_SAMPLE_SIZE && cv < MAX_NATURAL_CV,
  };
}
