import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
export class GameHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: true })
  lightPlayer: User;

  @ManyToOne(() => User, { nullable: true })
  darkPlayer: User;

  @Column({ nullable: true })
  winner: string; // 'LIGHT', 'DARK', or 'DRAW'

  @Column('simple-json')
  moves: any; // Serialized array of moves

  @Column('simple-json', { nullable: true })
  rules: any; // Serialized GameRules object (boardSize, forceMajorityCapture)

  // Phase 12: per-move think time in ms, parallel-indexed to `moves` — the raw signal
  // move-time anomaly detection is built on. Nullable so older rows (saved before
  // this column existed) just have no timing data rather than a migration.
  @Column('simple-json', { nullable: true })
  moveTimings: number[] | null;

  @CreateDateColumn()
  playedAt: Date;
}
