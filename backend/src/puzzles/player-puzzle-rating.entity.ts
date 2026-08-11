import { Entity, Column, PrimaryGeneratedColumn, Unique } from 'typeorm';

// A player's puzzle-solving rating — deliberately a separate Glicko-2 pool from their
// game rating (rating/player-rating.entity.ts). Being good at over-the-board play and
// being good at spotting tactics in an isolated position are related but different
// skills, and platforms that share one number for both get noisy results for each.
@Entity()
@Unique(['userId'])
export class PlayerPuzzleRating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column('float', { default: 1500 })
  rating: number;

  @Column('float', { default: 350 })
  ratingDeviation: number;

  @Column('float', { default: 0.06 })
  volatility: number;

  @Column({ default: 0 })
  puzzlesAttempted: number;
}
