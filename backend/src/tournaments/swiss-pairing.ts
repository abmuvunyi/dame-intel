// Pure Swiss pairing logic — no I/O, no NestJS, no framework, exactly like
// matchmaking.ts and glicko2.ts. This is a simplified Swiss pairing algorithm: it
// pairs players with similar scores and avoids rematches greedily, rather than
// implementing the full FIDE "Dutch system" (which also balances colors, float
// history, and does exhaustive backtracking to guarantee an optimal pairing exists).
// For a hobby platform's tournament mode, this is the right amount of complexity —
// documented explicitly so it isn't mistaken for a FIDE-certifiable implementation.

export interface SwissPlayer {
  id: number;
  score: number;
  opponentsFaced: number[]; // ids of every opponent already paired against, across all rounds so far
  hadBye: boolean; // whether this player has already received a bye in this tournament
}

export interface SwissPairingResult {
  player1: number;
  player2: number; // -1 signals a bye for player1 — see BYE
}

export const BYE = -1;

/**
 * Pairs one round. Players are grouped by score (highest first); within each pass,
 * each player is matched against the next-closest-scoring player they haven't faced
 * yet, falling back to a rematch only if every other opponent has already been
 * played (better than leaving someone unpaired). If the player count is odd, exactly
 * one player — the lowest-scoring player who hasn't already had a bye this
 * tournament — sits out and is awarded a bye (recorded as player2 === BYE).
 */
export function pairSwissRound(players: SwissPlayer[]): SwissPairingResult[] {
  if (players.length < 2) return [];

  // Highest score first; stable tiebreak by id so pairing is deterministic given the
  // same input (useful for tests, and for players not to feel the pairing is arbitrary).
  const sorted = [...players].sort((a, b) => b.score - a.score || a.id - b.id);

  const pairings: SwissPairingResult[] = [];
  let pool = sorted;

  if (pool.length % 2 !== 0) {
    let byeIdx = -1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!pool[i].hadBye) { byeIdx = i; break; }
    }
    // Edge case: everyone has already had a bye (very long tournament, small field) —
    // fall back to giving it to whoever is currently last in the standings.
    if (byeIdx === -1) byeIdx = pool.length - 1;

    pairings.push({ player1: pool[byeIdx].id, player2: BYE });
    pool = pool.filter((_, i) => i !== byeIdx);
  }

  const remaining = [...pool];
  while (remaining.length > 0) {
    const p1 = remaining.shift()!;
    let idx = remaining.findIndex(p => !p1.opponentsFaced.includes(p.id));
    if (idx === -1) idx = 0; // no fresh opponent left in the pool: allow a rematch rather than leave anyone unpaired
    const p2 = remaining.splice(idx, 1)[0];
    pairings.push({ player1: p1.id, player2: p2.id });
  }

  return pairings;
}
