import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

// A flag is ONLY ever created by the detection methods in AnticheatService — never a
// ban, never a rating change, nothing user-visible. It's purely a review-queue entry.
// Any actual consequence requires a human moderator acting through
// AnticheatService.applyModeratorAction (Phase 12 brief: "not an automatic ban —
// human review required").
@Entity()
export class CheatFlag {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @Column()
  flagType: string; // 'ENGINE_CORRELATION' | 'MOVE_TIMING'

  // The raw statistic that triggered this flag — meaning depends on flagType:
  // ENGINE_CORRELATION -> match ratio against the engine's top choice (0-1, higher
  // is more suspicious). MOVE_TIMING -> coefficient of variation of think-time
  // (lower is more suspicious). Deliberately not normalized to a single "0-1, higher
  // = worse" scale across both types — `reason` already states what the number means
  // in plain language, and forcing an artificial common scale would just obscure the
  // real statistic a moderator actually needs to judge the flag.
  @Column('float')
  score: number;

  @Column()
  reason: string;

  // The specific game that triggered an ENGINE_CORRELATION flag. Null for
  // MOVE_TIMING flags, which are computed by aggregating think-times across many of
  // the player's games — there's no single "supporting game" to point at.
  @Column({ type: 'int', nullable: true })
  gameId: number | null;

  // How many moves (ENGINE_CORRELATION) or timing samples (MOVE_TIMING) the score
  // was computed over — context a moderator needs to judge how much to trust it.
  @Column({ type: 'int', nullable: true })
  sampleSize: number | null;

  @Column({ default: false })
  reviewed: boolean;

  // No admin-role system exists anywhere in this codebase (same documented
  // simplification as Phase 7's puzzle admin routes and Phase 8b's tournament
  // lifecycle routes) — "moderator" just means whichever logged-in user hit the
  // review endpoint. Recorded here for an audit trail, not as an access-control check.
  @Column({ type: 'int', nullable: true })
  reviewedByUserId: number | null;

  @Column({ type: 'text', nullable: true })
  moderatorNote: string | null;

  // What the moderator actually decided — see User.moderationStatus for the values.
  // 'DISMISS' means "reviewed, no action" and is itself a valid, common outcome.
  @Column({ type: 'text', nullable: true })
  moderatorAction: string | null;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
