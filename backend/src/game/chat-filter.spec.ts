import { filterMessage, isRateLimited, pruneAndRecordTimestamp, SPAM_WINDOW_MS, SPAM_MAX_MESSAGES } from './chat-filter';

describe('chat-filter: profanity wordlist', () => {
  it('censors a profane word with asterisks of the same length', () => {
    const { filtered, wasFiltered } = filterMessage('you are a jerk, shit happens');
    expect(wasFiltered).toBe(true);
    expect(filtered).toBe('you are a jerk, **** happens');
  });

  it('is case-insensitive', () => {
    expect(filterMessage('SHIT!').filtered).toBe('****!');
  });

  it('leaves clean messages completely untouched', () => {
    const { filtered, wasFiltered } = filterMessage('good game, well played!');
    expect(wasFiltered).toBe(false);
    expect(filtered).toBe('good game, well played!');
  });

  it('only matches whole words, not substrings inside innocent words', () => {
    // "ass" is on nobody's wordlist here, but this guards the general word-boundary
    // approach: a word that merely CONTAINS a listed word must not get censored.
    const { filtered, wasFiltered } = filterMessage('assassin classic Shitake');
    expect(wasFiltered).toBe(false);
    expect(filtered).toBe('assassin classic Shitake');
  });

  it('censors multiple occurrences in the same message', () => {
    const { filtered } = filterMessage('shit shit shit');
    expect(filtered).toBe('**** **** ****');
  });
});

describe('chat-filter: spam rate limiting', () => {
  it('does not rate-limit a sender with no message history', () => {
    expect(isRateLimited([], Date.now())).toBe(false);
  });

  it('does not rate-limit up to the threshold', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: SPAM_MAX_MESSAGES - 1 }, (_, i) => now - i * 100);
    expect(isRateLimited(timestamps, now)).toBe(false);
  });

  it('rate-limits once the threshold is reached within the window', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: SPAM_MAX_MESSAGES }, (_, i) => now - i * 100);
    expect(isRateLimited(timestamps, now)).toBe(true);
  });

  it('ignores timestamps outside the sliding window', () => {
    const now = Date.now();
    // All SPAM_MAX_MESSAGES timestamps are stale (well before the window) — a fresh
    // message right now shouldn't be blocked by ancient history.
    const staleTimestamps = Array.from({ length: SPAM_MAX_MESSAGES + 5 }, () => now - SPAM_WINDOW_MS - 1000);
    expect(isRateLimited(staleTimestamps, now)).toBe(false);
  });

  it('pruneAndRecordTimestamp drops stale entries and appends the new one', () => {
    const now = Date.now();
    const history = [now - SPAM_WINDOW_MS - 1, now - 500];
    const updated = pruneAndRecordTimestamp(history, now);
    expect(updated).toEqual([now - 500, now]); // the stale one is gone, `now` is appended
  });

  it('a realistic burst: 5 rapid messages succeed, the 6th is blocked, and after the window passes messaging resumes', () => {
    let history: number[] = [];
    const t0 = 1_000_000;

    for (let i = 0; i < SPAM_MAX_MESSAGES; i++) {
      const now = t0 + i * 50; // 5 messages, 50ms apart — well within the window
      expect(isRateLimited(history, now)).toBe(false);
      history = pruneAndRecordTimestamp(history, now);
    }

    const sixthAttemptAt = t0 + SPAM_MAX_MESSAGES * 50;
    expect(isRateLimited(history, sixthAttemptAt)).toBe(true); // blocked

    const afterWindow = t0 + SPAM_WINDOW_MS + 1;
    expect(isRateLimited(history, afterWindow)).toBe(false); // window has fully elapsed
  });
});
