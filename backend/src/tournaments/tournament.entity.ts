import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { TournamentPlayer } from './tournament-player.entity';

@Entity()
export class Tournament {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  format: string; // 'Arena', 'Swiss', 'Knockout'

  // Arena tournaments (existing, untouched) use 'UPCOMING' / 'IN_PROGRESS' / 'COMPLETED',
  // driven by the time-based cron in TournamentsService.handleTournamentState(). Swiss
  // tournaments (Phase 8) use a richer lifecycle instead — 'SCHEDULED' /
  // 'REGISTRATION_OPEN' / 'IN_PROGRESS' / 'COMPLETED' — driven explicitly by
  // openRegistration()/startTournament()/generateNextRound(). Both value sets coexist
  // safely since this column isn't a DB-level enum, and the two formats' state
  // machines never query across each other.
  @Column({ default: 'UPCOMING' })
  status: string;

  @Column({ nullable: true })
  totalRounds: number; // Swiss only

  @Column({ default: 0 })
  currentRound: number; // Swiss only

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => TournamentPlayer, tp => tp.tournament)
  players: TournamentPlayer[];
}