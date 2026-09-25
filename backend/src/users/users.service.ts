import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, MoreThan, Repository } from 'typeorm';
import { User } from './user.entity';
import { updateStreak } from './streak';
import { Permission, Role, hasPermission, normalizeRoles, permissionsFor } from '../access/roles';
import { Access, accessFor } from '../billing/access';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    // Optional so unit tests can build UsersService with just a repository.
    @Optional() private readonly audit?: AuditService,
  ) {}

  // Promote every username listed in ADMIN_USERNAMES (comma-separated) to ADMIN at
  // boot. Idempotent and deliberately promote-only — removing a name from the env var
  // does NOT demote anyone (use `npm run admin:grant -- <name> --revoke`), so a typo
  // in a deploy's env can never silently lock every admin out.
  async onApplicationBootstrap(): Promise<void> {
    const names = parseAdminUsernames(process.env.ADMIN_USERNAMES);
    for (const username of names) {
      const user = await this.findOneByUsername(username);
      if (!user) {
        this.logger.warn(`ADMIN_USERNAMES lists "${username}", but no such user exists yet (register it, then restart).`);
        continue;
      }
      if (!this.getRoles(user).includes('ADMIN')) {
        await this.setRoles(user.id, [...this.getRoles(user), 'ADMIN'], { actorType: 'SYSTEM', reason: 'ADMIN_USERNAMES' });
      }
    }
  }

  getRoles(user: User | null | undefined): Role[] {
    return normalizeRoles(user?.roles);
  }

  getPermissions(user: User | null | undefined): Permission[] {
    return permissionsFor(user?.roles);
  }

  hasPermission(user: User | null | undefined, permission: Permission): boolean {
    return hasPermission(user?.roles, permission);
  }

  isAdmin(user: User | null | undefined): boolean {
    return this.getRoles(user).includes('ADMIN');
  }

  countAdmins(): Promise<number> {
    // simple-array is stored as comma-separated text; match ADMIN as a whole item.
    return this.usersRepository
      .createQueryBuilder('u')
      .where("(',' || u.roles || ',') LIKE :needle", { needle: '%,ADMIN,%' })
      .getCount();
  }

  /**
   * The ONLY way roles change. Replaces the user's roles, invalidates their existing
   * sessions (so a revoked role stops working immediately) and records an audit event.
   */
  async setRoles(
    userId: number,
    roles: readonly string[],
    ctx: { actorUserId?: number | null; actorType?: 'USER' | 'SYSTEM' | 'CLI'; reason?: string; req?: any } = {},
  ): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return null;
    const before = this.getRoles(user);
    const after = normalizeRoles(roles);
    if (before.join(',') === after.join(',')) return user;
    user.roles = after;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.usersRepository.save(user);
    this.logger.log(`Roles of "${user.username}" changed: [${before.join(', ')}] -> [${after.join(', ')}]`);
    await this.audit?.record({
      action: 'roles.changed',
      actorType: ctx.actorType ?? (ctx.actorUserId ? 'USER' : 'SYSTEM'),
      actorUserId: ctx.actorUserId ?? null,
      targetType: 'user',
      targetId: user.id,
      details: { username: user.username, before, after, reason: ctx.reason ?? null },
      req: ctx.req,
    });
    return user;
  }

  /** Invalidate every token issued so far for this user (bans, "log out everywhere"). */
  async revokeSessions(userId: number): Promise<void> {
    await this.usersRepository.increment({ id: userId }, 'tokenVersion', 1);
  }

  /** What this player can use right now (paid plan / trial / free) — see billing/access.ts. */
  accessFor(user: User | null | undefined, now: Date = new Date()): Access {
    return accessFor(user, now);
  }

  async searchUsers(query: string | undefined, limit = 25): Promise<User[]> {
    const q = (query ?? '').trim();
    return this.usersRepository.find({
      where: q ? { username: ILike(`%${q.replace(/[%_]/g, '')}%`) } : {},
      order: { id: 'ASC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /** Staff roles are rare, so this is cheap: everyone who holds at least one. */
  async listStaff(): Promise<User[]> {
    return this.usersRepository
      .createQueryBuilder('u')
      .where("u.roles <> ''")
      .orderBy('u.id', 'ASC')
      .getMany();
  }

  findOneByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ username });
  }

  findOneById(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async create(username: string, passwordHash: string): Promise<User> {
    const user = this.usersRepository.create({ username, passwordHash });
    return this.usersRepository.save(user);
  }

  async updateRating(id: number, ratingDelta: number, result: 'win' | 'loss' | 'draw'): Promise<User | null> {
      const user = await this.usersRepository.findOneBy({ id });
      if (!user) return null;

      user.rating = Math.max(100, user.rating + ratingDelta); // Rating floor of 100
      user.gamesPlayed += 1;
      if (result === 'win') user.wins += 1;
      else if (result === 'loss') user.losses += 1;
      else if (result === 'draw') user.draws += 1;

      return this.usersRepository.save(user);
  }

  // Phase 12: the ONLY place User.moderationStatus is ever written. Called
  // exclusively from AnticheatService.applyModeratorAction, which is itself only
  // reachable via the moderator review endpoint — never from the automated
  // detection methods. See CheatFlag/User entity comments for the full reasoning.
  async applyModeration(userId: number, status: string, note: string | null, tempBanUntil: Date | null): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return null;
    user.moderationStatus = status;
    user.moderationNote = note;
    user.tempBanUntil = tempBanUntil;
    // Phase 15: a ban ends every existing session immediately.
    if (status === 'TEMP_BANNED' || status === 'PERMA_BANNED') {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
    return this.usersRepository.save(user);
  }

  // Phase 12: true only while an active ban is actually in effect right now — a
  // TEMP_BANNED user whose tempBanUntil has already passed is NOT currently banned
  // (the graduated-response state itself isn't auto-cleared on expiry, since that
  // would be an automated status change; this just makes "are they blocked *right
  // now*" a single, correct check for callers like AuthService).
  isCurrentlyBanned(user: User): boolean {
    if (user.moderationStatus === 'PERMA_BANNED') return true;
    if (user.moderationStatus === 'TEMP_BANNED' && user.tempBanUntil) {
      return new Date(user.tempBanUntil).getTime() > Date.now();
    }
    return false;
  }

  // Phase 13: the ONE feature-flag check every gated feature calls — "a simple
  // feature-flag check on the user entity, not scattered ad-hoc checks" per the
  // brief. Nothing outside UsersService/SubscriptionsService should read
  // `membershipTier` directly.
  hasPremium(user: User | null | undefined): boolean {
    return this.accessFor(user).entitlements.premiumPuzzles;
  }

  findByStripeCustomerId(stripeCustomerId: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ stripeCustomerId });
  }

  // Persists the Stripe Customer mapping the first time a user starts checkout —
  // separate from applyMembershipUpdate below because this can happen before any
  // subscription (or webhook event) exists at all.
  async setStripeCustomerId(userId: number, stripeCustomerId: string): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return null;
    user.stripeCustomerId = stripeCustomerId;
    return this.usersRepository.save(user);
  }

  // The ONLY place membershipTier/membershipStatus/planVersion are written. Called
  // exclusively from SubscriptionsService's Stripe webhook handler — the single
  // source of truth is Stripe's own event stream, never a client request.
  async applyMembershipUpdate(
    userId: number,
    update: {
      tier: string;
      status: string;
      stripeSubscriptionId: string | null;
      renewsAt: Date | null;
      planVersion?: number | null;
      stripePriceId?: string | null;
      billingInterval?: string | null;
    },
  ): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return null;
    user.membershipTier = update.tier;
    user.membershipStatus = update.status;
    user.stripeSubscriptionId = update.stripeSubscriptionId;
    user.membershipRenewsAt = update.renewsAt;
    if (update.planVersion !== undefined) user.planVersion = update.planVersion;
    if (update.stripePriceId !== undefined) user.stripePriceId = update.stripePriceId;
    if (update.billingInterval !== undefined) user.billingInterval = update.billingInterval;
    return this.usersRepository.save(user);
  }

  // Free trial bookkeeping — the rules (one per account, not while subscribed) live
  // in TrialService; this only persists.
  async startTrial(userId: number, plan: string, version: number, startedAt: Date, endsAt: Date): Promise<User | null> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return null;
    user.trialPlan = plan;
    user.trialPlanVersion = version;
    user.trialStartedAt = startedAt;
    user.trialEndsAt = endsAt;
    user.trialEndingNotifiedAt = null;
    user.trialEndedNotifiedAt = null;
    return this.usersRepository.save(user);
  }

  async markTrialNotified(userId: number, field: 'trialEndingNotifiedAt' | 'trialEndedNotifiedAt', at: Date): Promise<void> {
    await this.usersRepository.update(userId, { [field]: at });
  }

  /** Trials that end within `withinMs` and haven't been warned yet. */
  findTrialsEndingSoon(now: Date, withinMs: number): Promise<User[]> {
    return this.usersRepository
      .createQueryBuilder('u')
      .where('u.trialEndsAt > :now AND u.trialEndsAt <= :limit', { now, limit: new Date(now.getTime() + withinMs) })
      .andWhere('u.trialEndingNotifiedAt IS NULL')
      .getMany();
  }

  /** Trials that have ended and haven't had their "trial ended" notice yet. */
  findEndedTrialsToNotify(now: Date): Promise<User[]> {
    return this.usersRepository
      .createQueryBuilder('u')
      .where('u.trialEndsAt <= :now', { now })
      .andWhere('u.trialEndedNotifiedAt IS NULL')
      .getMany();
  }

  async getRankings(limit: number = 100): Promise<User[]> {
    return this.usersRepository.find({
      order: { rating: 'DESC' },
      take: limit,
      select: ['id', 'username', 'rating', 'gamesPlayed', 'wins', 'losses', 'draws'],
    });
  }

  async getRatingStats(): Promise<{ bucket: string; count: number }[]> {
    // Basic distribution in buckets of 200 ELO
    const users = await this.usersRepository.find({ select: ['rating'] });
    const buckets: Record<string, number> = {};

    users.forEach((u) => {
      const bucketStart = Math.floor(u.rating / 200) * 200;
      const bucketName = `${bucketStart}-${bucketStart + 199}`;
      buckets[bucketName] = (buckets[bucketName] || 0) + 1;
    });

    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }

  // The only place that writes currentStreak/lastPlayedDate — see streak.ts for the
  // pure update rule. Called once per real (non-null, non-AI) player from
  // HistoryService.saveGame, the single choke point every completed game already
  // passes through, so no caller needs to remember to call this separately.
  async recordDailyPlay(userId: number): Promise<void> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
    const { streak, lastPlayedDate } = updateStreak(user.lastPlayedDate, user.currentStreak, today);
    if (streak !== user.currentStreak || lastPlayedDate !== user.lastPlayedDate) {
      await this.usersRepository.update(userId, { currentStreak: streak, lastPlayedDate });
    }
  }

  // 1-indexed global rank by rating (a #1 rank means "the highest rated player").
  // Counts strictly-higher ratings rather than sorting the whole table, so this stays
  // cheap regardless of how many users exist.
  async getRankFor(userId: number): Promise<{ rank: number, totalPlayers: number } | null> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) return null;

    const [higherRated, totalPlayers] = await Promise.all([
      this.usersRepository.count({ where: { rating: MoreThan(user.rating) } }),
      this.usersRepository.count(),
    ]);
    return { rank: higherRated + 1, totalPlayers };
  }

  // "Recommended Match" (home dashboard): the closest-rated currently-online player,
  // excluding the requester. Real data only — `onlineUserIds` comes from
  // PresenceService, the same live-socket registry the friends list's "online"
  // indicator already uses (Phase 10), not anything invented for this feature.
  async getRecommendedMatch(userId: number, onlineUserIds: number[]): Promise<User | null> {
    const me = await this.usersRepository.findOneBy({ id: userId });
    if (!me) return null;

    const candidateIds = onlineUserIds.filter((id) => id !== userId);
    if (candidateIds.length === 0) return null;

    const candidates = await this.usersRepository.find({
      where: { id: In(candidateIds) },
      select: ['id', 'username', 'rating'],
    });
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating));
    return candidates[0];
  }

  // Calculates the standard ELO rating change
  calculateEloChange(ratingA: number, ratingB: number, result: 'win' | 'loss' | 'draw', gamesPlayed: number): number {
    // Determine K-Factor (How volatile the rating is)
    let k = 20; // Standard
    if (gamesPlayed < 30) {
      k = 40; // High volatility for new players (Provisional)
    } else if (ratingA > 2400) {
      k = 10; // Low volatility for Grandmasters
    }

    // Expected win probability (0.0 to 1.0)
    const expectedScore = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));

    // Actual score
    let actualScore = 0.5; // Draw
    if (result === 'win') actualScore = 1.0;
    if (result === 'loss') actualScore = 0.0;

    // Calculate rating delta
    return Math.round(k * (actualScore - expectedScore));
  }
}

export function parseAdminUsernames(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
