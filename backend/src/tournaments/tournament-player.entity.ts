import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../users/user.entity';
import { Tournament } from './tournament.entity';

@Entity()
export class TournamentPlayer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tournament, t => t.players)
  tournament: Tournament;

  @ManyToOne(() => User)
  user: User;

  // Real pre-existing bug, found while building Phase 8b: without an explicit `'float'`
  // type, TypeORM's sqlite driver defaulted this column to `integer` — every drawn
  // game (Arena or Swiss) was silently truncating both players' +0.5 to +0. Every
  // other fractional-value entity in this codebase (PlayerRating, RatingHistoryEntry,
  // PlayerPuzzleRating, Puzzle's own rating fields) already used `'float'` correctly;
  // this one predates that convention and was missed. Fixed here since it directly
  // affects the organizer-configurable points system this phase adds.
  @Column('float', { default: 0 })
  score: number; // e.g. 1 point for win, 0.5 for draw, 0 for loss (or organizer-configured values — see Tournament.pointsWin/pointsDraw/pointsLoss)
}