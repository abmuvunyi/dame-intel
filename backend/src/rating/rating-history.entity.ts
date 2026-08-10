import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

// One row per completed rated game, per player — the append-only log a
// rating-over-time graph would read from. PlayerRating holds only the current
// snapshot; this is what makes that snapshot's history recoverable.
@Entity()
export class RatingHistoryEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  variant: string;

  @Column()
  timeControl: string;

  @Column('float')
  rating: number;

  @Column('float')
  ratingDeviation: number;

  @Column('float')
  volatility: number;

  @Column({ nullable: true })
  opponentUserId: number;

  @Column({ nullable: true })
  result: string; // 'win' | 'loss' | 'draw'

  @CreateDateColumn()
  createdAt: Date;
}
