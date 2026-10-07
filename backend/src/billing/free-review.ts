import { accessFor, AccessSubject } from './access';
import { currentPlan } from './plans';

// Free plan's one full game review per 24 hours (entitlements.dailyFreeReview).
// The player chooses which game to spend it on; that game's review and engine
// analysis then stay unlocked for 24h, and the next free review becomes available
// 24h after the last one was used. Pure: the caller persists the choice.

export const FREE_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

// Engine depth while analysing the game a free review was spent on — the same depth
// Plus gets, so the free review shows what the paid plan actually delivers.
export const FREE_REVIEW_ANALYSIS_DEPTH = currentPlan('PLUS').entitlements.analysisMaxDepth;

export interface FreeReviewSubject extends AccessSubject {
  lastFreeReviewAt?: Date | string | null;
  lastFreeReviewGameId?: number | null;
}

export interface FreeReviewState {
  // This game is the one the current free review was spent on, still within 24h.
  unlocked: boolean;
  unlockedUntil: Date | null;
  // A free review can be spent now (on any game).
  available: boolean;
  // When the next free review becomes available, if one isn't available now.
  nextAvailableAt: Date | null;
}

export function freeReviewState(
  user: FreeReviewSubject | null | undefined,
  gameId: number,
  now: Date = new Date(),
): FreeReviewState {
  const none: FreeReviewState = { unlocked: false, unlockedUntil: null, available: false, nextAvailableAt: null };
  if (!user || !accessFor(user, now).entitlements.dailyFreeReview) return none;

  const lastAt = user.lastFreeReviewAt ? new Date(user.lastFreeReviewAt) : null;
  const windowEnd = lastAt ? new Date(lastAt.getTime() + FREE_REVIEW_WINDOW_MS) : null;
  const inWindow = !!windowEnd && windowEnd.getTime() > now.getTime();
  const unlocked = inWindow && user.lastFreeReviewGameId === gameId;
  return {
    unlocked,
    unlockedUntil: unlocked ? windowEnd : null,
    available: !inWindow,
    nextAvailableAt: inWindow ? windowEnd : null,
  };
}
