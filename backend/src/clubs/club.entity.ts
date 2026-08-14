import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity()
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  // No ownership/role model beyond this (per the brief: "keep this simple for now")
  // — createdBy is informational only, not checked anywhere as a permission gate.
  // Any member can post to the feed; anyone can join or leave.
  @ManyToOne(() => User)
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;
}
