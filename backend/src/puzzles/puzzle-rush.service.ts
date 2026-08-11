import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleRushSession } from './puzzle-rush-session.entity';
import { PuzzlesService } from './puzzles.service';
import { Move } from '../game/engine/engine.service';

const DEFAULT_DURATION_SECONDS = 180; // "Storm": 3 minutes, same as chess.com's default
const MAX_DIFFICULTY = 3;
const DIFFICULTY_STEP_STREAK = 3; // every 3 in a row, try to serve a harder puzzle

export interface RushAttemptResult {
  correct: boolean;
  ended: boolean;
  timeLeftSeconds: number;
  score: number;
  streak: number;
  bestStreak: number;
  nextPuzzle?: any;
}

@Injectable()
export class PuzzleRushService {
  constructor(
    @InjectRepository(PuzzleRushSession)
    private sessionsRepository: Repository<PuzzleRushSession>,
    private puzzlesService: PuzzlesService,
  ) {}

  private timeLeft(session: PuzzleRushSession): number {
    const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
    return Math.max(0, session.durationSeconds - elapsed);
  }

  private difficultyFor(streak: number): number {
    return Math.min(MAX_DIFFICULTY, 1 + Math.floor(streak / DIFFICULTY_STEP_STREAK));
  }

  async start(userId: number | null, durationSeconds: number = DEFAULT_DURATION_SECONDS) {
    const firstPuzzle = await this.puzzlesService.getRandomPuzzle(1);
    if (!firstPuzzle) throw new NotFoundException('No puzzles available');

    let session = this.sessionsRepository.create({
      userId: userId ?? undefined,
      durationSeconds,
      currentPuzzleId: firstPuzzle.id,
    });
    session = await this.sessionsRepository.save(session);

    return {
      sessionId: session.id,
      puzzle: firstPuzzle,
      timeLeftSeconds: this.timeLeft(session),
    };
  }

  // Server-authoritative, same principle as the game clocks in Phase 5: time is
  // computed from `startedAt`/`durationSeconds` here, never trusted from the client.
  async attempt(sessionId: number, moveIndex: number, move: Move): Promise<RushAttemptResult> {
    const session = await this.sessionsRepository.findOneBy({ id: sessionId });
    if (!session) throw new NotFoundException('Rush session not found');
    if (session.ended) throw new BadRequestException('This run has already ended');
    if (!session.currentPuzzleId) throw new BadRequestException('No active puzzle on this session');

    const timeLeft = this.timeLeft(session);
    if (timeLeft <= 0) {
      session.ended = true;
      await this.sessionsRepository.save(session);
      return { correct: false, ended: true, timeLeftSeconds: 0, score: session.score, streak: session.streak, bestStreak: session.bestStreak };
    }

    const result = await this.puzzlesService.attemptMove(session.currentPuzzleId, session.userId ?? null, moveIndex, move);

    // A wrong move ends that puzzle's attempt immediately (no infinite retries — see
    // puzzles.service.ts: it already scored this as a loss against the puzzle rating).
    // In Storm mode this breaks the streak and moves straight to the next puzzle
    // rather than ending the whole run, matching chess.com's actual Storm behavior.
    if (!result.correct) {
      session.streak = 0;
      session.failed += 1;
    } else if (result.solved) {
      session.streak += 1;
      session.bestStreak = Math.max(session.bestStreak, session.streak);
      session.solved += 1;
      session.score += this.difficultyFor(session.streak - 1); // harder puzzles score more
    } else {
      // Correct so far but the sequence isn't finished — nothing to score yet, and
      // the puzzle continues rather than advancing to a new one.
      await this.sessionsRepository.save(session);
      return {
        correct: true,
        ended: false,
        timeLeftSeconds: this.timeLeft(session),
        score: session.score,
        streak: session.streak,
        bestStreak: session.bestStreak,
      };
    }

    const stillTime = this.timeLeft(session);
    if (stillTime <= 0) {
      session.ended = true;
      session.currentPuzzleId = null;
      await this.sessionsRepository.save(session);
      return { correct: result.correct, ended: true, timeLeftSeconds: 0, score: session.score, streak: session.streak, bestStreak: session.bestStreak };
    }

    const nextPuzzle = await this.puzzlesService.getRandomPuzzle(this.difficultyFor(session.streak));
    session.currentPuzzleId = nextPuzzle?.id ?? null;
    await this.sessionsRepository.save(session);

    return {
      correct: result.correct,
      ended: false,
      timeLeftSeconds: stillTime,
      score: session.score,
      streak: session.streak,
      bestStreak: session.bestStreak,
      nextPuzzle,
    };
  }

  async getSession(sessionId: number): Promise<PuzzleRushSession> {
    const session = await this.sessionsRepository.findOneBy({ id: sessionId });
    if (!session) throw new NotFoundException('Rush session not found');
    return session;
  }
}
