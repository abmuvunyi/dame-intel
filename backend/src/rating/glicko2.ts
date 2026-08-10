// Pure, framework-independent Glicko-2 implementation, following Mark Glickman's
// published algorithm exactly (http://www.glicko.net/glicko/glicko2.pdf, "The Glicko-2
// rating system", steps 1–8 in the "Algorithm" section). No I/O, no NestJS — directly
// unit-testable against the paper's own worked example (see glicko2.spec.ts), the same
// way the rules engine is tested against the FMJD rules text.
//
// Simplification: the paper defines a "rating period" as potentially containing many
// games; this implementation treats each individual game as its own one-opponent rating
// period, which is the standard, widely-used adaptation for continuous real-time online
// play (games arrive one at a time, not in scheduled batches) rather than the
// tournament/batch setting Glickman's paper was originally framed around.

const SCALE = 173.7178;
const DEFAULT_TAU = 0.5; // system constant bounding how fast volatility can change; 0.3-1.2 is typical
const CONVERGENCE_EPSILON = 0.000001;

export interface Glicko2Rating {
  rating: number;
  ratingDeviation: number;
  volatility: number;
}

export interface Glicko2Opponent {
  rating: number;
  ratingDeviation: number;
  score: number; // 1 = win, 0.5 = draw, 0 = loss, from this player's perspective
}

function toMu(rating: number): number {
  return (rating - 1500) / SCALE;
}

function toPhi(ratingDeviation: number): number {
  return ratingDeviation / SCALE;
}

// Step 3 / throughout: the "g" reduction function.
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// Step 3 / throughout: expected score of the player against one opponent.
function expectedScore(mu: number, muOpponent: number, phiOpponent: number): number {
  return 1 / (1 + Math.exp(-g(phiOpponent) * (mu - muOpponent)));
}

/**
 * Updates one player's rating after a rating period. `opponents` is empty for a period
 * with no games played (Step 6 only applies: RD grows toward more uncertainty, rating
 * and volatility are unchanged) or a list of results for periods with games.
 */
export function updateRating(player: Glicko2Rating, opponents: Glicko2Opponent[], tau: number = DEFAULT_TAU): Glicko2Rating {
  const mu = toMu(player.rating);
  const phi = toPhi(player.ratingDeviation);
  const sigma = player.volatility;

  if (opponents.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, ratingDeviation: phiStar * SCALE, volatility: sigma };
  }

  // Step 3: estimated variance of the rating, based purely on game outcomes.
  let vInverse = 0;
  for (const opp of opponents) {
    const muJ = toMu(opp.rating);
    const phiJ = toPhi(opp.ratingDeviation);
    const gJ = g(phiJ);
    const eJ = expectedScore(mu, muJ, phiJ);
    vInverse += gJ * gJ * eJ * (1 - eJ);
  }
  const v = 1 / vInverse;

  // Step 4: Δ, the estimated improvement in rating this period.
  let deltaSum = 0;
  for (const opp of opponents) {
    const muJ = toMu(opp.rating);
    const phiJ = toPhi(opp.ratingDeviation);
    deltaSum += g(phiJ) * (opp.score - expectedScore(mu, muJ, phiJ));
  }
  const delta = v * deltaSum;

  // Step 5: new volatility σ', solved via the paper's Illinois algorithm (a
  // regula-falsi variant) for f(x) = 0.
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (delta * delta - phi * phi - v - ex);
    const denominator = 2 * Math.pow(phi * phi + v + ex, 2);
    return numerator / denominator - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE_EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  // Step 6: pre-period-widened deviation φ*.
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);

  // Step 7: new φ and μ.
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  // Step 8: back to the original (Glicko/ELO-like) scale.
  return {
    rating: newMu * SCALE + 1500,
    ratingDeviation: newPhi * SCALE,
    volatility: newSigma,
  };
}

export const GLICKO2_DEFAULTS: Glicko2Rating = {
  rating: 1500,
  ratingDeviation: 350, // Glickman's recommended starting deviation for a brand-new player
  volatility: 0.06,
};
