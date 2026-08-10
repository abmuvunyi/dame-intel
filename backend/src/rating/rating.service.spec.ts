import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingService, PROVISIONAL_GAMES_THRESHOLD } from './rating.service';
import { PlayerRating } from './player-rating.entity';
import { RatingHistoryEntry } from './rating-history.entity';
import { GLICKO2_DEFAULTS } from './glicko2';

// Real in-memory sqlite, not a bare mocked Repository — pooling/provisional-threshold
// logic and history bookkeeping are genuine persistence behavior worth exercising
// against a real database, not just pure functions.
describe('RatingService', () => {
  let service: RatingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [PlayerRating, RatingHistoryEntry],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([PlayerRating, RatingHistoryEntry]),
      ],
      providers: [RatingService],
    }).compile();

    service = module.get<RatingService>(RatingService);
  });

  it('creates a new pool with Glicko-2 defaults on first access', async () => {
    const row = await service.getOrCreateRating(1, 'international', 'blitz');
    expect(row.rating).toBe(GLICKO2_DEFAULTS.rating);
    expect(row.ratingDeviation).toBe(GLICKO2_DEFAULTS.ratingDeviation);
    expect(row.volatility).toBe(GLICKO2_DEFAULTS.volatility);
    expect(row.gamesPlayed).toBe(0);
  });

  it('keeps separate pools per (variant, timeControl) for the same player', async () => {
    await service.getOrCreateRating(1, 'international', 'blitz');
    await service.getOrCreateRating(1, 'american', 'blitz');
    await service.getOrCreateRating(1, 'international', 'bullet');

    const pools = await service.getCurrentRatings(1);
    expect(pools).toHaveLength(3);
    const keys = pools.map(p => `${p.variant}/${p.timeControl}`).sort();
    expect(keys).toEqual(['american/blitz', 'international/blitz', 'international/bullet']);
  });

  it('marks a pool provisional below the games-played threshold, and not once it clears it', async () => {
    for (let i = 0; i < PROVISIONAL_GAMES_THRESHOLD - 1; i++) {
      await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'international', 'blitz', 'p1win');
    }
    let [pool1] = await service.getCurrentRatings(1);
    expect(pool1.gamesPlayed).toBe(PROVISIONAL_GAMES_THRESHOLD - 1);
    expect(pool1.provisional).toBe(true);

    await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'international', 'blitz', 'p1win');
    [pool1] = await service.getCurrentRatings(1);
    expect(pool1.gamesPlayed).toBe(PROVISIONAL_GAMES_THRESHOLD);
    expect(pool1.provisional).toBe(false);
  });

  it('updates both players ratings correctly after a win/loss and records history for both', async () => {
    const result = await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'international', 'blitz', 'p1win');

    expect(result.player1.rating).toBeGreaterThan(GLICKO2_DEFAULTS.rating);
    expect(result.player2.rating).toBeLessThan(GLICKO2_DEFAULTS.rating);
    expect(result.player1.gamesPlayed).toBe(1);
    expect(result.player2.gamesPlayed).toBe(1);

    const historyP1 = await service.getHistory(1);
    const historyP2 = await service.getHistory(2);
    expect(historyP1).toHaveLength(1);
    expect(historyP1[0].result).toBe('win');
    expect(historyP1[0].opponentUserId).toBe(2);
    expect(historyP2).toHaveLength(1);
    expect(historyP2[0].result).toBe('loss');
  });

  it('records a draw as a draw for both players with unchanged-in-direction ratings', async () => {
    const result = await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'international', 'blitz', 'draw');
    // Equal starting ratings, drawing: both should land back very close to the start.
    expect(result.player1.rating).toBeCloseTo(GLICKO2_DEFAULTS.rating, 0);
    expect(result.player2.rating).toBeCloseTo(GLICKO2_DEFAULTS.rating, 0);

    const historyP1 = await service.getHistory(1);
    expect(historyP1[0].result).toBe('draw');
  });

  it('does not let a game in one pool affect a different pool for the same player', async () => {
    await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'international', 'blitz', 'p1win');
    const americanPool = await service.getOrCreateRating(1, 'american', 'bullet');
    expect(americanPool.rating).toBe(GLICKO2_DEFAULTS.rating); // untouched by the international/blitz game
    expect(americanPool.gamesPlayed).toBe(0);
  });

  it('getHistory can be narrowed to a specific pool', async () => {
    await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'international', 'blitz', 'p1win');
    await service.recordGameResult({ userId: 1 }, { userId: 2 }, 'american', 'bullet', 'p2win');

    const blitzOnly = await service.getHistory(1, 'international', 'blitz');
    expect(blitzOnly).toHaveLength(1);
    expect(blitzOnly[0].timeControl).toBe('blitz');

    const all = await service.getHistory(1);
    expect(all).toHaveLength(2);
  });
});
