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

  @Column({ nullable: true, default: 'STANDARD_8X8' })
  variant: string;

  @CreateDateColumn()
  playedAt: Date;
}
