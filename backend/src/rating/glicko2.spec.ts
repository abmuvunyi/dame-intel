import { updateRating, Glicko2Opponent } from './glicko2';

describe('Glicko-2: reference worked example (Glickman, "The Glicko-2 rating system", Example section)', () => {
  // This is the exact example from the official paper (glicko.net/glicko/glicko2.pdf):
  // a player rated 1500, RD 200, volatility 0.06, plays three games in one rating
  // period against opponents rated (1400, RD 30), (1550, RD 100), (1700, RD 300),
  // with results win/loss/loss, using the default system constant tau = 0.5. The
  // paper works through every intermediate step and states the final answer as
  // rating' ~= 1464.06, RD' ~= 151.52, volatility' ~= 0.05999.
  const player = { rating: 1500, ratingDeviation: 200, volatility: 0.06 };
  const opponents: Glicko2Opponent[] = [
    { rating: 1400, ratingDeviation: 30, score: 1 },
    { rating: 1550, ratingDeviation: 100, score: 0 },
    { rating: 1700, ratingDeviation: 300, score: 0 },
  ];

  const result = updateRating(player, opponents, 0.5);

  it('matches the paper\'s stated new rating (~1464.06)', () => {
    expect(result.rating).toBeCloseTo(1464.06, 1);
  });

  it('matches the paper\'s stated new rating deviation (~151.52)', () => {
    expect(result.ratingDeviation).toBeCloseTo(151.52, 1);
  });

  it('matches the paper\'s stated new volatility (~0.05999)', () => {
    expect(result.volatility).toBeCloseTo(0.05999, 4);
  });
});

describe('Glicko-2: general properties', () => {
  it('leaves rating and volatility unchanged, but widens the deviation, for a player with no games in the period', () => {
    const player = { rating: 1600, ratingDeviation: 80, volatility: 0.06 };
    const result = updateRating(player, [], 0.5);

    expect(result.rating).toBe(1600);
    expect(result.volatility).toBe(0.06);
    expect(result.ratingDeviation).toBeGreaterThan(80);
  });

  it('increases rating after a win against an equally-rated opponent', () => {
    const player = { rating: 1500, ratingDeviation: 60, volatility: 0.06 };
    const result = updateRating(player, [{ rating: 1500, ratingDeviation: 60, score: 1 }], 0.5);
    expect(result.rating).toBeGreaterThan(1500);
  });

  it('decreases rating after a loss against an equally-rated opponent', () => {
    const player = { rating: 1500, ratingDeviation: 60, volatility: 0.06 };
    const result = updateRating(player, [{ rating: 1500, ratingDeviation: 60, score: 0 }], 0.5);
    expect(result.rating).toBeLessThan(1500);
  });

  it('leaves rating unchanged after a draw against an equally-rated opponent', () => {
    const player = { rating: 1500, ratingDeviation: 60, volatility: 0.06 };
    const result = updateRating(player, [{ rating: 1500, ratingDeviation: 60, score: 0.5 }], 0.5);
    expect(result.rating).toBeCloseTo(1500, 5);
  });

  it('moves a rating more for a lower-rated player beating a higher-rated one than the reverse (upset is worth more)', () => {
    const underdog = { rating: 1400, ratingDeviation: 60, volatility: 0.06 };
    const favorite = { rating: 1600, ratingDeviation: 60, volatility: 0.06 };

    const underdogWins = updateRating(underdog, [{ rating: 1600, ratingDeviation: 60, score: 1 }], 0.5);
    const favoriteWins = updateRating(favorite, [{ rating: 1400, ratingDeviation: 60, score: 1 }], 0.5);

    const underdogGain = underdogWins.rating - underdog.rating;
    const favoriteGain = favoriteWins.rating - favorite.rating;
    expect(underdogGain).toBeGreaterThan(favoriteGain);
  });

  it('always shrinks rating deviation after playing a game (more games played -> more confidence)', () => {
    const player = { rating: 1500, ratingDeviation: 200, volatility: 0.06 };
    const result = updateRating(player, [{ rating: 1500, ratingDeviation: 200, score: 0.5 }], 0.5);
    expect(result.ratingDeviation).toBeLessThan(200);
  });

  it('is symmetric: two equally-rated players who draw both end up with the same new rating', () => {
    const a = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };
    const b = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };

    const resultA = updateRating(a, [{ rating: b.rating, ratingDeviation: b.ratingDeviation, score: 0.5 }], 0.5);
    const resultB = updateRating(b, [{ rating: a.rating, ratingDeviation: a.ratingDeviation, score: 0.5 }], 0.5);

    expect(resultA.rating).toBeCloseTo(resultB.rating, 6);
    expect(resultA.ratingDeviation).toBeCloseTo(resultB.ratingDeviation, 6);
  });
});
