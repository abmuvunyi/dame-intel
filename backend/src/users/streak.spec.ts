import { updateStreak } from './streak';

describe('updateStreak', () => {
  it('starts a new streak at 1 for a user who has never played', () => {
    expect(updateStreak(null, 0, '2026-08-20')).toEqual({ streak: 1, lastPlayedDate: '2026-08-20' });
  });

  it('does not change the streak for a second game on the same day', () => {
    expect(updateStreak('2026-08-20', 5, '2026-08-20')).toEqual({ streak: 5, lastPlayedDate: '2026-08-20' });
  });

  it('extends the streak by 1 for a game played the very next calendar day', () => {
    expect(updateStreak('2026-08-20', 5, '2026-08-21')).toEqual({ streak: 6, lastPlayedDate: '2026-08-21' });
  });

  it('resets to 1 (not 0) after skipping a day', () => {
    expect(updateStreak('2026-08-19', 5, '2026-08-21')).toEqual({ streak: 1, lastPlayedDate: '2026-08-21' });
  });

  it('resets to 1 after a long gap', () => {
    expect(updateStreak('2026-01-01', 40, '2026-08-21')).toEqual({ streak: 1, lastPlayedDate: '2026-08-21' });
  });

  it('correctly crosses a month boundary as a real "next day"', () => {
    expect(updateStreak('2026-07-31', 10, '2026-08-01')).toEqual({ streak: 11, lastPlayedDate: '2026-08-01' });
  });

  it('correctly crosses a year boundary as a real "next day"', () => {
    expect(updateStreak('2026-12-31', 20, '2027-01-01')).toEqual({ streak: 21, lastPlayedDate: '2027-01-01' });
  });

  it('correctly handles a leap-day boundary', () => {
    // 2028 is a leap year — Feb 29 exists, and March 1 is genuinely "the next day".
    expect(updateStreak('2028-02-29', 7, '2028-03-01')).toEqual({ streak: 8, lastPlayedDate: '2028-03-01' });
  });
});
