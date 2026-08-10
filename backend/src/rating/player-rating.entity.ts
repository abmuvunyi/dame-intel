import { Entity, Column, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

// One row per (user, variant, time control) pool — a player has a fully distinct
// Glicko-2 rating in each. Created lazily on that pool's first completed game.
@Entity()
@Unique(['userId', 'variant', 'timeControl'])
export class PlayerRating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  variant: string; // 'international' | 'american' (DraughtsEngine's GameRules.variant)

  @Column()
  timeControl: string; // 'bullet' | 'blitz' | 'rapid' | 'correspondence'

  @Column('float', { default: 1500 })
  rating: number;

  @Column('float', { default: 350 })
  ratingDeviation: number;

  @Column('float', { default: 0.06 })
  volatility: number;

  @Column({ default: 0 })
  gamesPlayed: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
