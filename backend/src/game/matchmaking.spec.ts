import { findMatch, ratingBandFor, sweepMatches, SeekEntry } from './matchmaking';

const VARIANT_10 = { boardSize: 10, forceMajorityCapture: true };
const VARIANT_8 = { boardSize: 8, forceMajorityCapture: false };

function entry(overrides: Partial<SeekEntry>): SeekEntry {
  return {
    id: 'p1',
    rating: 1200,
    joinedAt: 0,
    variant: VARIANT_10,
    timeControl: 'blitz',
    ...overrides,
  };
}

describe('ratingBandFor', () => {
  it('starts at 100 for a player who just joined', () => {
    expect(ratingBandFor(entry({ joinedAt: 1000 }), 1000)).toBe(100);
  });

  it('widens by 50 every 5 seconds waited', () => {
    const e = entry({ joinedAt: 0 });
    expect(ratingBandFor(e, 4_000)).toBe(100); // 4s: no step yet
    expect(ratingBandFor(e, 5_000)).toBe(150); // 5s: one step
    expect(ratingBandFor(e, 12_000)).toBe(200); // 12s: two steps
  });

  it('caps at 1000 no matter how long the wait', () => {
    expect(ratingBandFor(entry({ joinedAt: 0 }), 10_000_000)).toBe(1000);
  });
});

describe('findMatch', () => {
  it('matches two close-rated players on the same variant and time control', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const opponent = entry({ id: 'b', rating: 1250, joinedAt: 0 });
    expect(findMatch(me, [opponent], 0)).toEqual(opponent);
  });

  it('does not match players whose rating gap exceeds both current bands', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const opponent = entry({ id: 'b', rating: 1600, joinedAt: 0 }); // 400 gap, band is 100
    expect(findMatch(me, [opponent], 0)).toBeNull();
  });

  it('matches once enough wait time has widened the band to cover the gap', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const opponent = entry({ id: 'b', rating: 1600, joinedAt: 0 }); // 400 gap
    // band = 100 + floor(waited/5)*50; needs >= 400 => 30s waited (band 400)
    expect(findMatch(me, [opponent], 29_000)).toBeNull(); // band 380, still short
    expect(findMatch(me, [opponent], 30_000)).toEqual(opponent); // band 400, now matches
  });

  it('requires mutual consent — a long-waiting player cannot force-match a freshly joined narrow-band player', () => {
    // "me" has waited a long time (wide band), "opponent" just joined (narrow band).
    // The 400 gap is within me's band but not within opponent's — no match.
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const opponent = entry({ id: 'b', rating: 1600, joinedAt: 100_000 });
    expect(findMatch(me, [opponent], 100_000)).toBeNull();
  });

  it('never matches a player against themselves even if present in the candidate list', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    expect(findMatch(me, [me], 0)).toBeNull();
  });

  it('does not match different board sizes/variants even with identical rating', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0, variant: VARIANT_10 });
    const opponent = entry({ id: 'b', rating: 1200, joinedAt: 0, variant: VARIANT_8 });
    expect(findMatch(me, [opponent], 0)).toBeNull();
  });

  it('does not match different time controls', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0, timeControl: 'blitz' });
    const opponent = entry({ id: 'b', rating: 1200, joinedAt: 0, timeControl: 'bullet' });
    expect(findMatch(me, [opponent], 0)).toBeNull();
  });

  it('does not match players seeking different tournaments (including open-queue vs. a tournament)', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0, tournamentId: undefined });
    const inTournament = entry({ id: 'b', rating: 1200, joinedAt: 0, tournamentId: 5 });
    const differentTournament = entry({ id: 'c', rating: 1200, joinedAt: 0, tournamentId: 6 });
    expect(findMatch(me, [inTournament], 0)).toBeNull();
    expect(findMatch(entry({ id: 'd', rating: 1200, joinedAt: 0, tournamentId: 5 }), [inTournament, differentTournament], 0)).toEqual(inTournament);
  });

  it('picks the closest-rated compatible candidate among several', () => {
    const me = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const far = entry({ id: 'b', rating: 1290, joinedAt: 0 });
    const close = entry({ id: 'c', rating: 1210, joinedAt: 0 });
    expect(findMatch(me, [far, close], 0)).toEqual(close);
  });
});

describe('sweepMatches', () => {
  it('pairs up multiple compatible players and leaves incompatible ones unmatched', () => {
    const a = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const b = entry({ id: 'b', rating: 1210, joinedAt: 0 });
    const c = entry({ id: 'c', rating: 1200, joinedAt: 0, variant: VARIANT_8 }); // different variant, alone

    const { pairs, unmatched } = sweepMatches([a, b, c], 0);

    expect(pairs).toHaveLength(1);
    expect(new Set(pairs[0].map(e => e.id))).toEqual(new Set(['a', 'b']));
    expect(unmatched.map(e => e.id)).toEqual(['c']);
  });

  it('never places the same player into two different pairs', () => {
    // Three mutually-compatible, similarly-rated players — only one pair can form.
    const a = entry({ id: 'a', rating: 1200, joinedAt: 0 });
    const b = entry({ id: 'b', rating: 1205, joinedAt: 1 });
    const c = entry({ id: 'c', rating: 1210, joinedAt: 2 });

    const { pairs, unmatched } = sweepMatches([a, b, c], 0);

    expect(pairs).toHaveLength(1);
    const pairedIds = pairs.flatMap(p => p.map(e => e.id));
    expect(new Set(pairedIds).size).toBe(2); // no duplicate
    expect(unmatched).toHaveLength(1);
  });

  it('lets a long-waiting entry match a freshly-joined one once the gap fits both bands', () => {
    // "old" has waited 50s (band 600); "mid" just joined (band 100, since matching is
    // mutual). Their 50-rating gap fits within both. "far" just joined too, but its
    // gap from everyone else is way beyond anyone's current band.
    const old = entry({ id: 'old', rating: 1000, joinedAt: 0 });
    const mid = entry({ id: 'mid', rating: 1050, joinedAt: 50_000 });
    const far = entry({ id: 'far', rating: 5000, joinedAt: 50_000 });

    const { pairs, unmatched } = sweepMatches([far, mid, old], 50_000);

    expect(pairs).toHaveLength(1);
    expect(new Set(pairs[0].map(e => e.id))).toEqual(new Set(['old', 'mid']));
    expect(unmatched.map(e => e.id)).toEqual(['far']);
  });
});
