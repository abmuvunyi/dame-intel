import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Tournament } from './tournament.entity';

@Entity()
export class SwissRound {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tournament)
  tournament: Tournament;

  @Column()
  tournamentId: number;

  @Column()
  roundNumber: number;

  @Column({ default: 'IN_PROGRESS' })
  status: string; // 'IN_PROGRESS' | 'COMPLETED'

  @CreateDateColumn()
  startedAt: Date;
}
