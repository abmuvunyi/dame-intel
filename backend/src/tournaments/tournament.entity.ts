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

  @Column({ default: 'UPCOMING' })
  status: string; // 'UPCOMING', 'IN_PROGRESS', 'COMPLETED'

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => TournamentPlayer, tp => tp.tournament)
  players: TournamentPlayer[];
}