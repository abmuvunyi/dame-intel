// Pure matchmaking pairing logic — no sockets, no NestJS, no Date.now() called
// internally (the caller always passes `now`), so this is exhaustively unit-testable
// exactly like the rules engine: feed it inputs, assert on outputs.

import { TimeControlName } from './time-control';

export interface SeekEntry {
  id: string; // opaque identifier (a socket id, in practice)
  rating: number;
  joinedAt: number; // ms epoch
  variant: { boardSize: number; forceMajorityCapture: boolean };
  timeControl: TimeControlName;
  tournamentId?: number;
}

const INITIAL_BAND = 100;
const BAND_STEP = 50;
const BAND_STEP_SECONDS = 5;
const MAX_BAND = 1000;

/** The rating gap this entry is currently willing to accept, given how long it's waited. */
export function ratingBandFor(entry: SeekEntry, now: number): number {
  const waitedSeconds = Math.max(0, (now - entry.joinedAt) / 1000);
  const band = INITIAL_BAND + Math.floor(waitedSeconds / BAND_STEP_SECONDS) * BAND_STEP;
  return Math.min(band, MAX_BAND);
}

function sameVariant(a: SeekEntry, b: SeekEntry): boolean {
  return a.variant.boardSize === b.variant.boardSize && a.variant.forceMajorityCapture === b.variant.forceMajorityCapture;
}

function compatible(a: SeekEntry, b: SeekEntry): boolean {
  return a.id !== b.id && a.tournamentId === b.tournamentId && a.timeControl === b.timeControl && sameVariant(a, b);
}

/**
 * Finds the closest-rated compatible opponent for `entry` within `candidates`, using
 * mutual consent: the rating gap must be within BOTH players' current band (a player
 * who just joined shouldn't be forced to match someone who's been widening their band
 * for five minutes, just because the long-waiter would accept anyone by now).
 */
export function findMatch(entry: SeekEntry, candidates: SeekEntry[], now: number): SeekEntry | null {
  const entryBand = ratingBandFor(entry, now);
  let best: SeekEntry | null = null;
  let bestDiff = Infinity;

  for (const candidate of candidates) {
    if (!compatible(entry, candidate)) continue;
    const diff = Math.abs(entry.rating - candidate.rating);
    if (diff > entryBand) continue;
    if (diff > ratingBandFor(candidate, now)) continue;
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  return best;
}

/**
 * Sweeps the whole queue and pairs up everyone it can. Oldest-waiting entries are
 * considered first, so a long-waiter with a wide band gets first claim on a match
 * before a pair of freshly-joined, still-narrow-band players might otherwise take it.
 * Pure — returns the pairs and what's left; the caller applies that to its real queue.
 */
export function sweepMatches(queue: SeekEntry[], now: number): { pairs: [SeekEntry, SeekEntry][]; unmatched: SeekEntry[] } {
  const remaining = [...queue].sort((a, b) => a.joinedAt - b.joinedAt);
  const taken = new Set<string>();
  const pairs: [SeekEntry, SeekEntry][] = [];

  for (const entry of remaining) {
    if (taken.has(entry.id)) continue;
    const candidates = remaining.filter(e => !taken.has(e.id) && e.id !== entry.id);
    const match = findMatch(entry, candidates, now);
    if (match) {
      pairs.push([entry, match]);
      taken.add(entry.id);
      taken.add(match.id);
    }
  }

  return { pairs, unmatched: remaining.filter(e => !taken.has(e.id)) };
}
