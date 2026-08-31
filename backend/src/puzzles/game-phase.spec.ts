import { classifyGamePhase } from './game-phase';

describe('classifyGamePhase', () => {
  // 10x10 International: 40 starting pieces (20/side).
  it('classifies a full or near-full board as the opening', () => {
    expect(classifyGamePhase(40, 40)).toBe('opening');
    expect(classifyGamePhase(31, 40)).toBe('opening'); // 77.5%, just above the 75% line
  });

  it('classifies a moderately-thinned board as the middlegame', () => {
    expect(classifyGamePhase(30, 40)).toBe('middlegame'); // 75% exactly -> not > 0.75
    expect(classifyGamePhase(20, 40)).toBe('middlegame'); // 50%
    expect(classifyGamePhase(15, 40)).toBe('middlegame'); // 37.5%, just above the 35% line
  });

  it('classifies a heavily-thinned board as the endgame', () => {
    expect(classifyGamePhase(14, 40)).toBe('endgame'); // 35% exactly -> not > 0.35
    expect(classifyGamePhase(4, 40)).toBe('endgame');
  });

  // 8x8 American: 24 starting pieces (12/side) — same fractional thresholds, a
  // different absolute piece count, proving this isn't secretly tuned to one board.
  it('applies the same fractional thresholds to the smaller 8x8 board', () => {
    expect(classifyGamePhase(24, 24)).toBe('opening');
    expect(classifyGamePhase(12, 24)).toBe('middlegame'); // 50%
    expect(classifyGamePhase(6, 24)).toBe('endgame'); // 25%
  });
});
