import { FREE_REVIEW_ANALYSIS_DEPTH, freeReviewState } from './free-review';

const HOUR = 3_600_000;
const now = new Date('2026-10-08T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * HOUR);

describe('freeReviewState (Free plan: one game review per 24h)', () => {
  it('a Free user who never used it has one available, nothing unlocked yet', () => {
    expect(freeReviewState({ membershipTier: 'FREE' }, 1, now)).toEqual({ unlocked: false, unlockedUntil: null, available: true, nextAvailableAt: null });
  });

  it('unlocks only the chosen game for 24h, and the next review comes 24h after the last', () => {
    const user = { membershipTier: 'FREE', lastFreeReviewAt: ago(3), lastFreeReviewGameId: 1 };
    const until = new Date(ago(3).getTime() + 24 * HOUR);
    expect(freeReviewState(user, 1, now)).toEqual({ unlocked: true, unlockedUntil: until, available: false, nextAvailableAt: until });
    expect(freeReviewState(user, 2, now)).toEqual({ unlocked: false, unlockedUntil: null, available: false, nextAvailableAt: until });
  });

  it('after 24h the old game locks again and a new review is available', () => {
    const user = { membershipTier: 'FREE', lastFreeReviewAt: ago(24), lastFreeReviewGameId: 1 };
    expect(freeReviewState(user, 1, now)).toMatchObject({ unlocked: false, available: true });
  });

  it('does not apply to anonymous viewers or paid plans (they have full review instead)', () => {
    expect(freeReviewState(null, 1, now).available).toBe(false);
    expect(freeReviewState({ membershipTier: 'PLUS', membershipStatus: 'ACTIVE' }, 1, now).available).toBe(false);
  });

  it('analyses at the same depth Plus gets', () => {
    expect(FREE_REVIEW_ANALYSIS_DEPTH).toBe(6);
  });
});
