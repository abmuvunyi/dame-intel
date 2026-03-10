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

  @Column({ default: 0 })
  score: number; // e.g. 1 point for win, 0.5 for draw, 0 for loss
}