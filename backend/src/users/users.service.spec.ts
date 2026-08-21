import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Repository } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
           provide: getRepositoryToken(User),
           useClass: Repository
        }
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate ELO correctly', () => {
    // Standard win
    let delta = service.calculateEloChange(1200, 1200, 'win', 50);
    expect(delta).toBe(10); // K=20 * (1 - 0.5)

    // Standard loss
    delta = service.calculateEloChange(1200, 1200, 'loss', 50);
    expect(delta).toBe(-10); // K=20 * (0 - 0.5)

    // Provisional player win (high K factor)
    delta = service.calculateEloChange(1200, 1200, 'win', 5);
    expect(delta).toBe(20); // K=40 * 0.5

    // GM win (low K factor)
    delta = service.calculateEloChange(2500, 2500, 'win', 500);
    expect(delta).toBe(5); // K=10 * 0.5
  });
});

// Phase 12: graduated anti-cheat response — real in-memory sqlite, since this is
// genuine persisted state a moderator action has to actually stick.
describe('UsersService: graduated moderation response (Phase 12)', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [User], synchronize: true }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('a brand-new user has moderationStatus NONE and is not banned', async () => {
    const user = await service.create('alice', 'hash');
    expect(user.moderationStatus).toBe('NONE');
    expect(service.isCurrentlyBanned(user)).toBe(false);
  });

  it('applyModeration persists WARNED and it is queryable afterward', async () => {
    const created = await service.create('bob', 'hash');
    await service.applyModeration(created.id, 'WARNED', 'first offense', null);

    const fetched = await service.findOneById(created.id);
    expect(fetched!.moderationStatus).toBe('WARNED');
    expect(fetched!.moderationNote).toBe('first offense');
    expect(service.isCurrentlyBanned(fetched!)).toBe(false); // a warning isn't a ban
  });

  it('PERMA_BANNED is always currently banned', async () => {
    const created = await service.create('carol', 'hash');
    const updated = await service.applyModeration(created.id, 'PERMA_BANNED', 'engine assistance confirmed', null);
    expect(service.isCurrentlyBanned(updated!)).toBe(true);
  });

  it('TEMP_BANNED with a future tempBanUntil is currently banned', async () => {
    const created = await service.create('dave', 'hash');
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const updated = await service.applyModeration(created.id, 'TEMP_BANNED', 'timing anomaly', future);
    expect(service.isCurrentlyBanned(updated!)).toBe(true);
  });

  it('TEMP_BANNED with a tempBanUntil already in the past is NOT currently banned', async () => {
    const created = await service.create('erin', 'hash');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const updated = await service.applyModeration(created.id, 'TEMP_BANNED', 'timing anomaly', past);
    // The status itself isn't auto-cleared (that would be an automated status
    // change) — but the ban is no longer actually in effect.
    expect(updated!.moderationStatus).toBe('TEMP_BANNED');
    expect(service.isCurrentlyBanned(updated!)).toBe(false);
  });

  it('RATING_RESET_FLAGGED does not itself block login', async () => {
    const created = await service.create('frank', 'hash');
    const updated = await service.applyModeration(created.id, 'RATING_RESET_FLAGGED', 'under review', null);
    expect(service.isCurrentlyBanned(updated!)).toBe(false);
  });

  it('applyModeration on a nonexistent user returns null rather than throwing', async () => {
    await expect(service.applyModeration(999999, 'WARNED', null, null)).resolves.toBeNull();
  });
});

// Home-dashboard redesign: real in-memory sqlite, same pattern as the moderation
// block above — this is genuine persisted state (streaks) and genuine cross-row
// queries (rank, recommended match), not pure functions in isolation.
describe('UsersService: home-dashboard features', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [User], synchronize: true }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('recordDailyPlay', () => {
    it('sets a brand-new user to a streak of 1 on their first recorded game', async () => {
      const user = await service.create('alice', 'hash');
      await service.recordDailyPlay(user.id);

      const fresh = await service.findOneById(user.id);
      expect(fresh!.currentStreak).toBe(1);
      expect(fresh!.lastPlayedDate).toBe(new Date().toISOString().slice(0, 10));
    });

    it('does not double-count a second call on the same day', async () => {
      const user = await service.create('bob', 'hash');
      await service.recordDailyPlay(user.id);
      await service.recordDailyPlay(user.id);

      const fresh = await service.findOneById(user.id);
      expect(fresh!.currentStreak).toBe(1);
    });

    it('does nothing (and does not throw) for a nonexistent user', async () => {
      await expect(service.recordDailyPlay(999999)).resolves.toBeUndefined();
    });
  });

  describe('getRankFor', () => {
    it('ranks the single highest-rated user as #1', async () => {
      const top = await service.create('top', 'hash');
      await service.updateRating(top.id, 500, 'win'); // 1200 -> 1700, well clear of the default
      await service.create('mid', 'hash'); // stays at the 1200 default

      const rank = await service.getRankFor(top.id);
      expect(rank).toEqual({ rank: 1, totalPlayers: 2 });
    });

    it('reflects a lower rank for a lower-rated user among the same players', async () => {
      const top = await service.create('top', 'hash');
      await service.updateRating(top.id, 500, 'win');
      const mid = await service.create('mid', 'hash');

      const rank = await service.getRankFor(mid.id);
      expect(rank).toEqual({ rank: 2, totalPlayers: 2 });
    });

    it('returns null for a nonexistent user', async () => {
      await expect(service.getRankFor(999999)).resolves.toBeNull();
    });
  });

  describe('getRecommendedMatch', () => {
    it('picks the online candidate whose rating is closest to the requester\'s', async () => {
      const me = await service.create('me', 'hash'); // rating 1200
      const near = await service.create('near', 'hash');
      await service.updateRating(near.id, 50, 'win'); // 1250 — closer
      const far = await service.create('far', 'hash');
      await service.updateRating(far.id, 400, 'win'); // 1600 — further

      const recommended = await service.getRecommendedMatch(me.id, [me.id, near.id, far.id]);
      expect(recommended!.id).toBe(near.id);
    });

    it('never recommends the requester to themselves', async () => {
      const me = await service.create('me', 'hash');
      const recommended = await service.getRecommendedMatch(me.id, [me.id]);
      expect(recommended).toBeNull();
    });

    it('returns null when no one else is online', async () => {
      const me = await service.create('me', 'hash');
      const recommended = await service.getRecommendedMatch(me.id, []);
      expect(recommended).toBeNull();
    });
  });
});
