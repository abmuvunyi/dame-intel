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
}
