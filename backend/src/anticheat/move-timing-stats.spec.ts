import { coefficientOfVariation, detectTimingAnomaly, MIN_SAMPLE_SIZE, MAX_NATURAL_CV, MIN_MEANINGFUL_THINK_MS } from './move-timing-stats';

describe('coefficientOfVariation', () => {
  it('returns null for an empty sample', () => {
    expect(coefficientOfVariation([])).toBeNull();
  });

  it('returns exactly 0 for perfectly identical values (zero variance)', () => {
    expect(coefficientOfVariation([1000, 1000, 1000, 1000])).toBe(0);
  });

  it('is scale-invariant — doubling every value doesn\'t change the ratio', () => {
    const a = coefficientOfVariation([500, 1000, 1500, 2000]);
    const b = coefficientOfVariation([1000, 2000, 3000, 4000]);
    expect(b).toBeCloseTo(a!, 10);
  });

  it('is higher for more spread-out (more human-like) timings', () => {
    const consistent = coefficientOfVariation([1000, 1050, 950, 1020, 980]);
    const variable = coefficientOfVariation([200, 5000, 800, 12000, 300]);
    expect(variable!).toBeGreaterThan(consistent!);
  });
});

describe('detectTimingAnomaly', () => {
  it('does not flag with fewer than MIN_SAMPLE_SIZE meaningful samples, even if perfectly consistent', () => {
    const timings = Array(MIN_SAMPLE_SIZE - 1).fill(1000);
    const result = detectTimingAnomaly(timings);
    expect(result.sampleSize).toBe(MIN_SAMPLE_SIZE - 1);
    expect(result.isAnomalous).toBe(false);
  });

  it('flags a bot-like fixed-delay pattern once there are enough samples', () => {
    const timings = Array(MIN_SAMPLE_SIZE).fill(1000); // identical every time -> CV = 0
    const result = detectTimingAnomaly(timings);
    expect(result.coefficientOfVariation).toBe(0);
    expect(result.isAnomalous).toBe(true);
  });

  it('flags a near-constant pattern with only tiny natural jitter (CV just under the threshold)', () => {
    // +/- 5% noise around 1000ms — a script with a small random sleep, still far
    // tighter than genuine human think-time variability.
    const timings = Array.from({ length: 50 }, (_, i) => 1000 + (i % 2 === 0 ? 30 : -30));
    const result = detectTimingAnomaly(timings);
    expect(result.coefficientOfVariation).toBeLessThan(MAX_NATURAL_CV);
    expect(result.isAnomalous).toBe(true);
  });

  it('does not flag a realistic, highly variable human-like timing distribution', () => {
    // Mix of fast obvious moves and slow deliberations — the normal shape of real play.
    const timings = [300, 400, 15000, 800, 200, 22000, 1200, 500, 9000, 350, 600, 18000,
                      250, 700, 4000, 900, 300, 11000, 450, 600, 21000, 380, 720, 5200,
                      260, 640, 3300, 470, 610, 16000];
    expect(timings.length).toBeGreaterThanOrEqual(MIN_SAMPLE_SIZE);
    const result = detectTimingAnomaly(timings);
    expect(result.coefficientOfVariation).toBeGreaterThan(MAX_NATURAL_CV);
    expect(result.isAnomalous).toBe(false);
  });

  it('filters out trivial/instant moves below MIN_MEANINGFUL_THINK_MS before computing variance', () => {
    // 40 near-instant "moves" (UI lag / forced positions, not real thinks) mixed with
    // 30 identical 1000ms ones — without filtering, the instant ones would dilute the
    // sample and could mask (or randomly distort) the fixed-delay pattern.
    const trivial = Array(40).fill(10);
    const suspicious = Array(30).fill(1000);
    const result = detectTimingAnomaly([...trivial, ...suspicious]);
    expect(result.sampleSize).toBe(30); // only the non-trivial ones counted
    expect(result.isAnomalous).toBe(true);
  });

  it('does not flag when filtering leaves fewer than MIN_SAMPLE_SIZE real samples', () => {
    const trivial = Array(100).fill(10); // all filtered out
    const suspicious = Array(10).fill(1000); // consistent, but too few
    const result = detectTimingAnomaly([...trivial, ...suspicious]);
    expect(result.sampleSize).toBe(10);
    expect(result.isAnomalous).toBe(false);
  });
});
