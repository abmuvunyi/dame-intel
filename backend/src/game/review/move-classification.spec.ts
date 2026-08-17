import { classifyMove, computeAccuracy, CLASSIFICATION_THRESHOLDS, MoveClassification } from './move-classification';

describe('classifyMove: explicit eval-delta thresholds', () => {
  it('classifies a delta of exactly 0 (matches the engine\'s top move) as BEST', () => {
    expect(classifyMove(0)).toBe('BEST');
  });

  it('treats a negative delta the same as 0 (BEST) — should never happen but must not misclassify', () => {
    // analyzePosition() sorts best-first, so the played move can never beat the top
    // move in practice; this just guards the boundary rather than assuming callers
    // are perfectly well-behaved.
    expect(classifyMove(-1)).toBe('BEST');
  });

  it('classifies the smallest possible non-zero delta as GOOD', () => {
    expect(classifyMove(0.01)).toBe('GOOD');
  });

  it('classifies exactly at the GOOD/INACCURACY boundary correctly on both sides', () => {
    expect(classifyMove(CLASSIFICATION_THRESHOLDS.GOOD_MAX)).toBe('GOOD');
    expect(classifyMove(CLASSIFICATION_THRESHOLDS.GOOD_MAX + 0.01)).toBe('INACCURACY');
  });

  it('classifies exactly at the INACCURACY/MISTAKE boundary correctly on both sides', () => {
    expect(classifyMove(CLASSIFICATION_THRESHOLDS.INACCURACY_MAX)).toBe('INACCURACY');
    expect(classifyMove(CLASSIFICATION_THRESHOLDS.INACCURACY_MAX + 0.01)).toBe('MISTAKE');
  });

  it('classifies exactly at the MISTAKE/BLUNDER boundary correctly on both sides', () => {
    expect(classifyMove(CLASSIFICATION_THRESHOLDS.MISTAKE_MAX)).toBe('MISTAKE');
    expect(classifyMove(CLASSIFICATION_THRESHOLDS.MISTAKE_MAX + 0.01)).toBe('BLUNDER');
  });

  it('classifies a large delta (e.g. hanging a piece to a multi-capture) as BLUNDER', () => {
    expect(classifyMove(50)).toBe('BLUNDER');
  });

  it('the five classification bands are contiguous and exhaustive across a wide sampled range', () => {
    // No gaps, no overlaps, no value maps to more than one band — sweep a fine-grained
    // range and confirm every classifyMove() call succeeds with a valid label.
    const valid: MoveClassification[] = ['BEST', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER'];
    for (let delta = -5; delta <= 100; delta += 0.5) {
      expect(valid).toContain(classifyMove(delta));
    }
  });
});

describe('computeAccuracy: per-player summary', () => {
  it('returns null for a player with no classified moves', () => {
    expect(computeAccuracy([])).toBeNull();
  });

  it('returns exactly 100 for a player who only ever played BEST moves', () => {
    expect(computeAccuracy(['BEST', 'BEST', 'BEST'])).toBe(100);
  });

  it('returns exactly 0 for a player who only ever blundered', () => {
    expect(computeAccuracy(['BLUNDER', 'BLUNDER'])).toBe(0);
  });

  it('averages mixed classifications using each one\'s credit value', () => {
    // BEST=100, BLUNDER=0 -> average 50
    expect(computeAccuracy(['BEST', 'BLUNDER'])).toBe(50);
  });

  it('rounds to one decimal place rather than returning a long float', () => {
    // BEST(100) + GOOD(90) + INACCURACY(70) = 260 / 3 = 86.666...
    expect(computeAccuracy(['BEST', 'GOOD', 'INACCURACY'])).toBe(86.7);
  });

  it('is monotonic: replacing any move with a worse classification never increases accuracy', () => {
    const base: MoveClassification[] = ['BEST', 'GOOD', 'INACCURACY', 'MISTAKE'];
    const worsened: MoveClassification[] = ['BEST', 'GOOD', 'INACCURACY', 'BLUNDER'];
    expect(computeAccuracy(worsened)!).toBeLessThan(computeAccuracy(base)!);
  });
});
