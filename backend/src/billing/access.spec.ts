import { accessFor, isTrialActive } from './access';

const NOW = new Date('2026-09-23T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

describe('accessFor (effective plan)', () => {
  it('a new account is on Free', () => {
    const a = accessFor({}, NOW);
    expect(a).toMatchObject({ plan: 'FREE', source: 'FREE' });
    expect(a.entitlements.premiumPuzzles).toBe(false);
    expect(a.trial).toMatchObject({ active: false, used: false });
  });

  it('an active paid subscription grants its plan version', () => {
    const a = accessFor({ membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE', planVersion: 1 }, NOW);
    expect(a).toMatchObject({ plan: 'PREMIUM', version: 1, source: 'SUBSCRIPTION' });
    expect(a.entitlements.hostTournaments).toBe(true);
  });

  it('keeps access during a payment problem (PAST_DUE) but not after cancellation', () => {
    expect(accessFor({ membershipTier: 'PLUS', membershipStatus: 'PAST_DUE' }, NOW).plan).toBe('PLUS');
    expect(accessFor({ membershipTier: 'PLUS', membershipStatus: 'CANCELED' }, NOW).plan).toBe('FREE');
    expect(accessFor({ membershipTier: 'PLUS', membershipStatus: 'NONE' }, NOW).plan).toBe('FREE');
  });

  it('an active trial grants the trial plan until it ends, then falls back to Free by itself', () => {
    const user = { trialPlan: 'PLUS', trialPlanVersion: 1, trialStartedAt: inDays(-6), trialEndsAt: inDays(1) };
    expect(accessFor(user, NOW)).toMatchObject({ plan: 'PLUS', source: 'TRIAL' });
    expect(isTrialActive(user, NOW)).toBe(true);

    const later = inDays(1.01);
    const after = accessFor(user, later);
    expect(after).toMatchObject({ plan: 'FREE', source: 'FREE' });
    expect(after.trial).toMatchObject({ active: false, used: true });
  });

  it('the higher of subscription and trial wins', () => {
    const user = {
      membershipTier: 'PLUS', membershipStatus: 'ACTIVE',
      trialPlan: 'PREMIUM', trialStartedAt: inDays(-1), trialEndsAt: inDays(6),
    };
    expect(accessFor(user, NOW)).toMatchObject({ plan: 'PREMIUM', source: 'TRIAL' });
    expect(accessFor({ ...user, trialPlan: 'PLUS' }, NOW)).toMatchObject({ plan: 'PLUS', source: 'SUBSCRIPTION' });
  });

  it('never grants access from unknown/corrupt values', () => {
    expect(accessFor({ membershipTier: 'GOLD', membershipStatus: 'ACTIVE' }, NOW).plan).toBe('FREE');
    expect(accessFor({ trialPlan: 'GOLD', trialEndsAt: inDays(3) }, NOW).plan).toBe('FREE');
  });
});