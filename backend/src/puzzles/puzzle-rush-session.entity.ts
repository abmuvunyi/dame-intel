import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

// A single timed Puzzle Storm run. Server-authoritative: `startedAt` + `durationSeconds`
// is what actually determines when the run ends (see PuzzleRushService), never a
// client-reported "time's up" — same principle as the game clocks in Phase 5.
@Entity()
export class PuzzleRushSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: number; // nullable: anonymous play is allowed, just isn't saved to any leaderboard

  @CreateDateColumn()
  startedAt: Date;

  @Column()
  durationSeconds: number;

  @Column({ nullable: true, type: 'int' })
  currentPuzzleId: number | null;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 0 })
  streak: number;

  @Column({ default: 0 })
  bestStreak: number;

  @Column({ default: 0 })
  solved: number;

  @Column({ default: 0 })
  failed: number;

  @Column({ default: false })
  ended: boolean;
}
