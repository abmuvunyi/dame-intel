import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Puzzle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  difficulty: number; // e.g., 1 (easy), 2 (medium), 3 (hard)

  @Column('simple-json')
  board: any; // Initial state

  @Column()
  turnToMove: string; // 'L' or 'D'

  @Column('simple-json')
  correctMove: any; // The correct move to solve the puzzle
}
