import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Club } from './club.entity';
import { User } from '../users/user.entity';

// A basic, flat club-only discussion feed — no threading, no comments, no reactions.
// "Full forums can come later" per the brief; this is deliberately just a list of
// posts in a club, newest first.
@Entity()
export class ClubPost {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Club)
  club: Club;

  @Column()
  clubId: number;

  @ManyToOne(() => User)
  author: User;

  @Column('text')
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
