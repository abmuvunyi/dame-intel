import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
export class CheatFlag {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  user: User;

  @Column('float')
  engineCorrelationScore: number;

  @Column()
  reason: string;

  @Column({ default: false })
  reviewed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
