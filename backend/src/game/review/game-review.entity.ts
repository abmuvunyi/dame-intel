import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { MoveClassification } from './move-classification';
import { PieceColor, Move } from '../engine/engine.service';

export interface MoveReview {
  moveIndex: number;
  mover: PieceColor;
  classification: MoveClassification;
  evalDelta: number; // >= 0, in AiService.evaluateBoard()'s units (WEIGHT_MAN = 10)
  // The position's evaluation immediately AFTER this move, normalized to LIGHT's
  // perspective (positive = good for Light, negative = good for Dark) regardless of
  // who actually moved — AiService.analyzePosition() reports evaluations from the
  // MOVER's own perspective, which flips sign every ply; a chess.com-style eval bar
  // needs one consistent axis across the whole game, not one that flips direction
  // every other entry. Same units as evalDelta (WEIGHT_MAN = 10).
  evaluation: number;
  // The engine's own top-rated move at this position (before `move` was played) —
  // lets the frontend show "here's what you should have played" directly on the
  // board without a separate on-demand analysis request, same data source evalDelta
  // already comes from. Null only if the engine found no legal moves at all (should
  // never happen for a position with a move actually played there).
  bestMove: Move | null;
  // A short (a few plies) engine-vs-engine continuation starting with `bestMove`,
  // for the frontend's "why was this the best move" preview — set only when
  // classification isn't BEST (nothing to demonstrate otherwise). Deliberately just
  // the concrete move sequence plus whatever eval swing a viewer can already read off
  // it, not a generated natural-language explanation — this codebase has no way to
  // honestly generate "why" prose beyond what the search itself can show.
  recommendedLine: Move[] | null;
  // A short engine-vs-engine continuation starting from the position AFTER the
  // actual (bad) move was played, showing the opponent's own best reply and a couple
  // of follow-ups — "how does this get punished". Set only for MISTAKE/BLUNDER
  // moves. This is the engine's own predicted best play for the opponent from that
  // point on, not necessarily what actually happened in the rest of the real game —
  // labeled as such wherever it's shown.
  punishmentLine: Move[] | null;
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

  @Column({ type: Date, nullable: true }) // `Date` (not 'datetime') maps to datetime on sqlite AND timestamp on Postgres
  completedAt: Date | null;
}
