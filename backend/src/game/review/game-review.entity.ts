import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { MoveClassification } from './move-classification';
import { PieceColor } from '../engine/engine.service';

export interface MoveReview {
  moveIndex: number;
  mover: PieceColor;
  classification: MoveClassification;
  evalDelta: number; // >= 0, in AiService.evaluateBoard()'s units (WEIGHT_MAN = 10)
}

// One row per analyzed game — "don't recompute on every view" (Phase 11 brief) means
// this has to be a real persisted result, not something derived on each request.
// `gameId` isn't a foreign key/relation to GameHistory on purpose: this lives in the
// same module as the engine/AI (game/review), while GameHistory lives in its own
// history module — a plain id avoids a cross-module entity dependency for what's
// fundamentally a 1:1 lookup by id, the same choice SwissPairingRecord made for
// player ids over full User relations.
@Entity()
export class GameReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  gameId: number;

  @Column({ default: 'PENDING' })
  status: string; // 'PENDING' | 'COMPLETED' | 'FAILED'

  @Column('simple-json', { nullable: true })
  moveReviews: MoveReview[] | null;

  @Column({ type: 'float', nullable: true })
  lightAccuracy: number | null;

  @Column({ type: 'float', nullable: true })
  darkAccuracy: number | null;

  // Explicit `type` on both of these — a bare `@Column({ nullable: true })` on a
  // `T | null` property confuses TypeORM's reflect-metadata-based type inference
  // (the union collapses to `Object`, which sqlite can't map at all) into throwing
  // `DataTypeNotSupportedError` at startup. Same fix already applied elsewhere in
  // this codebase (e.g. Tournament.maxParticipants) — found here the hard way, via a
  // test suite that wouldn't even boot until this was explicit.
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;
}
