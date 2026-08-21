import { hashDateToIndex } from './daily-puzzle';

describe('hashDateToIndex', () => {
  it('is deterministic — the same date always maps to the same index', () => {
    const a = hashDateToIndex('2026-08-21', 50);
    const b = hashDateToIndex('2026-08-21', 50);
    expect(a).toBe(b);
  });

  it('always returns an index within [0, modulus)', () => {
    for (let i = 0; i < 30; i++) {
      const dateStr = `2026-01-${String(i + 1).padStart(2, '0')}`;
      const index = hashDateToIndex(dateStr, 7);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(7);
    }
  });

  it('produces a reasonable spread across consecutive dates, not always the same index', () => {
    const indexes = new Set<number>();
    for (let day = 1; day <= 28; day++) {
      indexes.add(hashDateToIndex(`2026-02-${String(day).padStart(2, '0')}`, 100));
    }
    // Not a strict uniformity requirement — just confirms this isn't secretly a
    // constant function that would show the same puzzle every day regardless of date.
    expect(indexes.size).toBeGreaterThan(10);
  });

  it('handles a modulus of 1 (a single published puzzle) by always returning 0', () => {
    expect(hashDateToIndex('2026-08-21', 1)).toBe(0);
    expect(hashDateToIndex('2027-03-15', 1)).toBe(0);
  });
});
