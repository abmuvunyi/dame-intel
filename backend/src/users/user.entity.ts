import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column({ type: 'datetime', nullable: true })
  tempBanUntil: Date | null; // only meaningful while moderationStatus === 'TEMP_BANNED'

  @Column({ type: 'text', nullable: true })
  moderationNote: string | null;

  // Phase 13: paid membership. `membershipTier` is the ONE field every feature gate
  // checks (via UsersService.hasPremium()) — "a simple feature-flag check on the user
  // entity, not scattered ad-hoc checks", per the brief. Everything else here is
  // Stripe bookkeeping needed to keep that one field correct, not something feature
  // code should ever read directly.
  @Column({ default: 'FREE' })
  membershipTier: string; // 'FREE' | 'PREMIUM'

  // Stripe's own subscription lifecycle status, mirrored as-is from webhook events —
  // kept separate from membershipTier because Stripe has more granularity (e.g.
  // 'past_due' is still technically an active subscription with a payment problem)
  // than the simple binary gate the rest of the app needs.
  @Column({ default: 'NONE' })
  membershipStatus: string; // 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'

  @Column({ type: 'text', nullable: true, unique: true })
  stripeCustomerId: string | null;

  @Column({ type: 'text', nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'datetime', nullable: true })
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
