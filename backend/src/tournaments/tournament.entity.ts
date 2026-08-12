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

  // --- Organizer-configurable settings (Phase 8b) ---
  // Set once at creation (createTournament) and immutable afterwards — same
  // treatment as totalRounds above. All default to values that reproduce Phase 8's
  // original hardcoded behavior exactly, so pre-existing Arena rows (and any Swiss
  // tournament created without specifying them) behave identically to before.

  // Registration cap. null = unlimited (the only behavior that existed pre-Phase 8b).
  @Column({ nullable: true, type: 'int' })
  maxParticipants: number | null;

  // Governs every game's clock in this tournament — see time-control.ts for valid
  // names. The organizer's setting, not any individual player's preference.
  @Column({ default: 'blitz' })
  timeControlName: string;

  @Column({ default: 10 })
  boardSize: number; // 8 (American) or 10 (International)

  @Column({ default: 'international' })
  ruleVariant: string; // 'international' | 'american' — see engine/engine.service.ts's GameRules.variant

  // Tournament points awarded per game result, organizer-set. Defaults match the
  // standard 1 / 0.5 / 0 scoring `updateTournamentScore` always used before this
  // existed. Explicit `'float'` type — see the comment on TournamentPlayer.score for
  // why that matters on sqlite (a bare `number` column silently truncates 0.5 to 0).
  @Column('float', { default: 1 })
  pointsWin: number;

  @Column('float', { default: 0.5 })
  pointsDraw: number;

  @Column('float', { default: 0 })
  pointsLoss: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => TournamentPlayer, tp => tp.tournament)
  players: TournamentPlayer[];
}