import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Club } from './club.entity';
import { User } from '../users/user.entity';

@Entity()
export class ClubMembership {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Club)
  club: Club;

  @Column()
  clubId: number;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: number;

  @CreateDateColumn()
  joinedAt: Date;
}
