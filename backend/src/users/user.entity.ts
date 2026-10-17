import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ default: 1200 })
  rating: number; // ELO rating, defaults to 1200

  // Staff roles (see access/roles.ts): ADMIN, MODERATOR, ORGANIZER, CONTENT_EDITOR.
  // Players have none. Stored as a comma-separated list (portable across Postgres
  // and sqlite). Written only by UsersService.setRoles(), which is reachable from the
  // ADMIN-only role-management API, the ADMIN_USERNAMES boot promotion and the
  // `npm run admin:grant` CLI — every change is recorded in the audit trail.
  @Column('simple-array', { default: '' })
  roles: string[];

  // Bumped whenever a user's access must be cut immediately (role change, ban,
  // "log out everywhere"). Every issued JWT carries the value it was minted with;
  // AuthGuard rejects tokens whose value no longer matches.
  @Column({ default: 0 })
  tokenVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: 0 })
  gamesPlayed: number;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  losses: number;

  @Column({ default: 0 })
  draws: number;

  // Phase 12: graduated anti-cheat response. Settable ONLY through
  // AnticheatService.applyModeratorAction (reachable only via the moderator review
  // endpoint) — never written by the automated detection methods themselves, which
  // only ever create CheatFlag rows for a human to look at.
  @Column({ default: 'NONE' })
  moderationStatus: string; // 'NONE' | 'WARNED' | 'RATING_RESET_FLAGGED' | 'TEMP_BANNED' | 'PERMA_BANNED'

  @Column({ type: Date, nullable: true }) // `Date` (not 'datetime') maps to datetime on sqlite AND timestamp on Postgres
  tempBanUntil: Date | null; // only meaningful while moderationStatus === 'TEMP_BANNED'

  @Column({ type: 'text', nullable: true })
  moderationNote: string | null;

  // Paid membership, mirrored from Stripe webhooks (see billing/plans.ts for the
  // catalog and billing/access.ts for how the EFFECTIVE plan is worked out, including
  // trials). Feature code never reads these directly — it asks
  // UsersService.accessFor(user).entitlements.
  @Column({ default: 'FREE' })
  membershipTier: string; // paid plan code: 'FREE' | 'PLUS' | 'PREMIUM'

  // Which version of that plan the subscriber bought (grandfathering: their
  // entitlements stay those of this version even after the catalog changes).
  @Column({ type: 'int', nullable: true })
  planVersion: number | null;

  @Column({ type: 'text', nullable: true })
  billingInterval: string | null; // 'monthly' | 'annual'

  @Column({ type: 'text', nullable: true })
  stripePriceId: string | null;

  // Stripe's own subscription lifecycle status, mirrored as-is from webhook events —
  // kept separate from membershipTier because Stripe has more granularity (e.g.
  // 'past_due' is still technically an active subscription with a payment problem)
  // than the simple binary gate the rest of the app needs.
  @Column({ default: 'NONE' })
  membershipStatus: string; // 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'

  // Free trial (no card): one per account, ever. trialStartedAt being set is what
  // marks the trial as used; access ends by time alone at trialEndsAt.
  @Column({ type: 'text', nullable: true })
  trialPlan: string | null;

  @Column({ type: 'int', nullable: true })
  trialPlanVersion: number | null;

  @Column({ type: Date, nullable: true })
  trialStartedAt: Date | null;

  @Column({ type: Date, nullable: true })
  trialEndsAt: Date | null;

  @Column({ type: Date, nullable: true })
  trialEndingNotifiedAt: Date | null;

  @Column({ type: Date, nullable: true })
  trialEndedNotifiedAt: Date | null;

  // Free plan's one-review-per-24h (billing/free-review.ts): which game it was spent
  // on and when. That game stays unlocked for 24h; the next one is available after.
  @Column({ type: Date, nullable: true })
  lastFreeReviewAt: Date | null;

  @Column({ type: 'int', nullable: true })
  lastFreeReviewGameId: number | null;

  @Column({ type: 'text', nullable: true, unique: true })
  stripeCustomerId: string | null;

  @Column({ type: 'text', nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: Date, nullable: true }) // `Date` (not 'datetime') maps to datetime on sqlite AND timestamp on Postgres
  membershipRenewsAt: Date | null;

  // Phase 13: needed for real transactional email delivery. Nullable and never
  // collected during registration in this phase (that's a settings-page UI this
  // phase didn't build — a reasonable, explicitly out-of-scope follow-up) — kept
  // honest rather than synthesizing a fake address for every user just so
  // NotificationsService always has "something" to send to.
  @Column({ type: 'text', nullable: true })
  email: string | null;

  // Home-dashboard redesign: a chess.com-style "daily play streak" — consecutive
  // calendar days (UTC) with at least one completed game. The pure update rule lives
  // in streak.ts; UsersService.recordDailyPlay is the only place that writes these
  // two fields (called once per real player from HistoryService.saveGame, the single
  // choke point every completed game — PvP or vs-AI — already passes through).
  @Column({ default: 0 })
  currentStreak: number;

  @Column({ type: 'text', nullable: true })
  lastPlayedDate: string | null; // YYYY-MM-DD, UTC
}
