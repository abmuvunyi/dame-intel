// Pure, framework-independent daily-play-streak logic — same pattern as
// subscription-status.ts / move-classification.ts / chat-filter.ts: no NestJS, no
// I/O, directly unit-testable. Modeled on chess.com's own "daily streak": counts
// consecutive CALENDAR DAYS (UTC) with at least one completed game, not consecutive
// wins — playing once today and once yesterday keeps the streak alive regardless of
// result; skipping a day resets it to 1, not 0 (today itself still counts).
export interface StreakUpdate {
  streak: number;
  lastPlayedDate: string; // YYYY-MM-DD, UTC
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / MS_PER_DAY);
}

// `today` is passed in (rather than computed internally with `new Date()`) so this
// stays a pure function of its inputs — the caller (UsersService.recordDailyPlay)
// supplies the real current date; tests supply whatever they need to exercise.
export function updateStreak(lastPlayedDate: string | null, currentStreak: number, today: string): StreakUpdate {
  if (lastPlayedDate === today) {
    return { streak: currentStreak, lastPlayedDate: today }; // already played today — no change
  }
  if (lastPlayedDate !== null && daysBetween(lastPlayedDate, today) === 1) {
    return { streak: currentStreak + 1, lastPlayedDate: today }; // played yesterday — extends
  }
  return { streak: 1, lastPlayedDate: today }; // a gap of 2+ days, or the very first game ever
}
