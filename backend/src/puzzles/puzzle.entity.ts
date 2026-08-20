import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Puzzle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  difficulty: number; // e.g., 1 (easy) .. 3 (hard) — a coarse, human-assigned/estimated band

  @Column({ default: 8 })
  boardSize: number; // 8 or 10 — needed to reconstruct the right engine/variant

  @Column('simple-json')
  board: any; // Position at the start of the puzzle

  @Column()
  turnToMove: string; // 'L' or 'D' — the solver's color

  // The full solution sequence: solver's move, then the opponent's forced/expected
  // reply (auto-played), then the solver's next move, and so on. A single-move puzzle
  // (the common case, including everything the generator in puzzle-generator.service.ts
  // produces) is just an array of length 1. Deliberately never sent to the client —
  // see puzzles.service.ts's `toPublic()` — solving is validated server-side against
  // the real rules engine, not compared against a value the browser already has.
  @Column('simple-json')
  solution: any[];

  @Column({ default: 'published' })
  status: string; // 'published' | 'pending' | 'rejected' — see Phase 7 admin review flow

  @Column({ nullable: true })
  sourceGameId: number; // set for puzzles created by the generation pipeline

  // The puzzle's own Glicko-2 rating — see rating/glicko2.ts. Treating every solve
  // attempt as a one-off "game" between the player and the puzzle (chess.com/lichess
  // style) is what makes both "difficulty" and "player skill" adjust from the same
  // signal, per the brief ("adjusting based on solve success/failure and puzzle
  // difficulty").
  @Column('float', { default: 1500 })
  rating: number;

  @Column('float', { default: 350 })
  ratingDeviation: number;

  @Column('float', { default: 0.06 })
  volatility: number;

  @Column({ default: 0 })
  timesAttempted: number;

  @Column({ default: 0 })
  timesSolved: number;

  // Phase 13: one of the two features actually gated behind PREMIUM in this app (see
  // UsersService.hasPremium() — the single feature-flag check everything routes
  // through). Defaults to false so every existing puzzle stays freely accessible;
  // only newly marked ones are exclusive.
  @Column({ default: false })
  isPremium: boolean;
}
