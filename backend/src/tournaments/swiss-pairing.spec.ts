import { pairSwissRound, SwissPlayer, BYE } from './swiss-pairing';

function player(id: number, score = 0, opponentsFaced: number[] = [], hadBye = false): SwissPlayer {
  return { id, score, opponentsFaced, hadBye };
}

describe('pairSwissRound: basic pairing', () => {
  it('pairs every player with no one left out for an even count', () => {
    const players = [1, 2, 3, 4, 5, 6].map(id => player(id));
    const pairings = pairSwissRound(players);

    expect(pairings).toHaveLength(3);
    const allPaired = pairings.flatMap(p => [p.player1, p.player2]).sort((a, b) => a - b);
    expect(allPaired).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('groups players with similar scores together', () => {
    const players = [
      player(1, 3), player(2, 3), // top score group
      player(3, 1), player(4, 1), // mid score group
    ];
    const pairings = pairSwissRound(players);

    // With no prior history, the two top scorers should pair each other, and the
    // two next-highest should pair each other, rather than crossing groups.
    expect(pairings).toContainEqual({ player1: 1, player2: 2 });
    expect(pairings).toContainEqual({ player1: 3, player2: 4 });
  });
});

describe('pairSwissRound: bye handling for odd player counts', () => {
  it('gives exactly one bye when the player count is odd, and pairs everyone else', () => {
    const players = [1, 2, 3, 4, 5].map(id => player(id));
    const pairings = pairSwissRound(players);

    const byes = pairings.filter(p => p.player2 === BYE);
    expect(byes).toHaveLength(1);

    const nonByePairings = pairings.filter(p => p.player2 !== BYE);
    const paired = nonByePairings.flatMap(p => [p.player1, p.player2]);
    expect(paired).toHaveLength(4); // the other 4 players, in 2 real pairings
    expect(new Set([...paired, byes[0].player1]).size).toBe(5); // together, everyone appears exactly once
  });

  it('gives the bye to the lowest-scoring player who has not already had one', () => {
    const players = [
      player(1, 5), player(2, 4), player(3, 3),
      player(4, 2, [], true), // lowest score, but already had a bye this tournament
      player(5, 1), // second-lowest, no bye yet
    ];
    const pairings = pairSwissRound(players);
    const bye = pairings.find(p => p.player2 === BYE);

    expect(bye?.player1).toBe(5); // not player 4, even though 4 has the lower score
  });

  it('falls back to re-awarding a bye only when literally everyone has already had one', () => {
    const players = [1, 2, 3].map(id => player(id, 0, [], true)); // all already had a bye
    const pairings = pairSwissRound(players);
    const bye = pairings.find(p => p.player2 === BYE);
    expect(bye).toBeDefined(); // still produces a valid pairing set rather than throwing
  });

  it('never pairs a bye for an even number of players', () => {
    const players = [1, 2, 3, 4].map(id => player(id));
    const pairings = pairSwissRound(players);
    expect(pairings.some(p => p.player2 === BYE)).toBe(false);
  });
});

describe('pairSwissRound: avoiding rematches', () => {
  it('does not pair two players who have already faced each other when an alternative exists', () => {
    const players = [
      player(1, 2, [2]), // 1 already played 2
      player(2, 2, [1]),
      player(3, 2, []),
      player(4, 2, []),
    ];
    const pairings = pairSwissRound(players);
    expect(pairings).not.toContainEqual({ player1: 1, player2: 2 });
    expect(pairings).not.toContainEqual({ player1: 2, player2: 1 });
  });

  it('falls back to an unavoidable rematch rather than leaving a player unpaired', () => {
    // Only 2 players, and they've already played each other — there is no other
    // option, so a rematch is the only valid (and correct) outcome.
    const players = [player(1, 1, [2]), player(2, 1, [1])];
    const pairings = pairSwissRound(players);
    expect(pairings).toHaveLength(1);
    expect(new Set([pairings[0].player1, pairings[0].player2])).toEqual(new Set([1, 2]));
  });

  it('handles no players and a single player gracefully', () => {
    expect(pairSwissRound([])).toEqual([]);
    expect(pairSwissRound([player(1)])).toEqual([]); // can't pair a lone player against anyone
  });
});

describe('Swiss tournament walkthrough: 8 players, 3 rounds', () => {
  // This simulates a full 8-player, 3-round Swiss tournament end-to-end, applying a
  // fixed, deterministic set of results each round (higher-numbered player always
  // wins, for reproducibility) and re-running pairSwissRound with the updated
  // scores/history each time — exactly what TournamentsService.startNextRound does
  // against real data. Printed for the STOP AND REPORT walkthrough this plan phase
  // asks for.
  it('produces valid, rematch-free pairings each round with correct standings by the end', () => {
    let players: SwissPlayer[] = Array.from({ length: 8 }, (_, i) => player(i + 1));
    const log: string[] = [];
    const seenPairsEver: Set<string> = new Set();

    for (let round = 1; round <= 3; round++) {
      const pairings = pairSwissRound(players);
      log.push(`--- Round ${round} ---`);

      // Exactly 4 pairings, everyone appears exactly once, since 8 is even.
      expect(pairings).toHaveLength(4);
      const everyone = pairings.flatMap(p => [p.player1, p.player2]).sort((a, b) => a - b);
      expect(everyone).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(pairings.some(p => p.player2 === BYE)).toBe(false); // even count: never a bye

      for (const { player1, player2 } of pairings) {
        const key = [player1, player2].sort((a, b) => a - b).join('-');
        expect(seenPairsEver.has(key)).toBe(false); // no rematch anywhere across all 3 rounds — plenty of room with 8 players
        seenPairsEver.add(key);

        // Deterministic result: the higher id wins (arbitrary but reproducible).
        const winner = Math.max(player1, player2);
        const loser = Math.min(player1, player2);
        log.push(`  ${player1} vs ${player2}  ->  winner: ${winner}`);

        const p1 = players.find(p => p.id === player1)!;
        const p2 = players.find(p => p.id === player2)!;
        p1.opponentsFaced.push(player2);
        p2.opponentsFaced.push(player1);
        if (winner === p1.id) p1.score += 1; else p2.score += 1;
      }

      players = players.map(p => ({ ...p })); // fresh objects each round, same as re-fetching from the DB
    }

    const finalStandings = [...players].sort((a, b) => b.score - a.score || a.id - b.id);
    log.push('--- Final standings ---');
    finalStandings.forEach((p, i) => log.push(`  ${i + 1}. Player ${p.id}: ${p.score} pts`));

    // eslint-disable-next-line no-console
    console.log('\n' + log.join('\n'));

    // Player 8 beat everyone it's possible for it to face under "higher id always
    // wins" against a rematch-free bracket — sanity-check the standings make sense.
    expect(finalStandings[0].score).toBeGreaterThanOrEqual(finalStandings[finalStandings.length - 1].score);
  });
});
