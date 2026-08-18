import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheatFlag } from './cheat-flag.entity';
import { AiService } from '../game/ai/ai/ai.service';
import { DraughtsEngine, PieceColor, Move, GameRules } from '../game/engine/engine.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { detectTimingAnomaly, MIN_SAMPLE_SIZE as MIN_TIMING_SAMPLES } from './move-timing-stats';
import { CLASSIFICATION_THRESHOLDS } from '../game/review/move-classification';

// --- Engine-correlation thresholds (Phase 12: "especially in complex/critical
// positions rather than forced/obvious ones") ---
//
// A position only counts toward the correlation ratio if it was genuinely a choice:
// more than one legal move existed, AND the gap between the best and worst option
// was large enough to matter (reusing Phase 11's own GOOD_MAX threshold — "a real,
// non-cosmetic difference existed between the options" — rather than inventing a
// second, arbitrary number for the same underlying question). A forced single-legal-
// move position, or one where every option scores about the same, tells you nothing
// about whether the player is engine-assisted; anyone would "match the engine" there.
const CRITICALITY_SPREAD_THRESHOLD = CLASSIFICATION_THRESHOLDS.GOOD_MAX;
// Below this many critical positions, a high match ratio isn't statistically
// meaningful — could easily be a strong, but human, player having a good day.
const MIN_CRITICAL_POSITIONS = 10;
// At or above this match ratio in critical positions specifically, flag for review.
// Matching the engine's exact top choice in >90% of positions that actually had a
// meaningful alternative is far beyond what even strong human players sustain —
// human play deviates from engine-optimal regularly even at a high level, especially
// under a real clock.
const ENGINE_MATCH_THRESHOLD = 0.9;
// Search depth for the correlation replay. Matches the review/analysis default
// elsewhere in the app (Phase 11) — deep enough to catch real tactics, shallow
// enough to keep this a background pass, not a blocking one.
const ANALYSIS_DEPTH = 4;

@Injectable()
export class AnticheatService {
  constructor(
    @InjectRepository(CheatFlag)
    private cheatFlagRepository: Repository<CheatFlag>,
    private aiService: AiService,
    private usersService: UsersService,
    private historyService: HistoryService,
  ) {}

  // ============================================================
  // Detection — these ONLY ever create CheatFlag rows. Never touch
  // User.moderationStatus. See applyModeratorAction below for the one and only path
  // that can (Phase 12 brief: "not an automatic ban — human review required").
  // ============================================================

  public async analyzeGameForCheating(
    lightPlayer: User | null,
    darkPlayer: User | null,
    moves: Move[],
    rules?: Partial<GameRules>,
    moveTimings?: number[],
    gameId?: number,
  ) {
    if (!lightPlayer && !darkPlayer) return;
    if (moves.length < 10) return; // Too short to analyze accurately

    await this.analyzeEngineCorrelation(lightPlayer, darkPlayer, moves, rules, gameId);
    // Move-timing anomaly detection aggregates ACROSS games, so it runs independently
    // of the engine-correlation replay above (and independently for each player).
    if (lightPlayer) await this.analyzeMoveTimingForPlayer(lightPlayer, true, moveTimings);
    if (darkPlayer) await this.analyzeMoveTimingForPlayer(darkPlayer, false, moveTimings);
  }

  private async analyzeEngineCorrelation(
    lightPlayer: User | null,
    darkPlayer: User | null,
    moves: Move[],
    rules: Partial<GameRules> | undefined,
    gameId: number | undefined,
  ) {
    const engine = new DraughtsEngine(rules ?? {});
    let lightCriticalMoves = 0, lightCriticalMatches = 0;
    let darkCriticalMoves = 0, darkCriticalMatches = 0;

    const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));

    for (const move of moves) {
      const currentTurn = engine.getCurrentTurn();
      const evaluations = this.aiService.analyzePosition(engine, ANALYSIS_DEPTH);

      if (evaluations.length > 1) {
        const spread = evaluations[0].evaluation - evaluations[evaluations.length - 1].evaluation;
        if (spread > CRITICALITY_SPREAD_THRESHOLD) {
          const bestMove = evaluations[0].move;
          const isMatch = bestMove.from.row === move.from.row && bestMove.from.col === move.from.col &&
                          bestMove.to.row === move.to.row && bestMove.to.col === move.to.col;

          if (currentTurn === PieceColor.LIGHT) {
            lightCriticalMoves++;
            if (isMatch) lightCriticalMatches++;
          } else {
            darkCriticalMoves++;
            if (isMatch) darkCriticalMatches++;
          }
        }
      }

      engine.makeMove(move);
      await yieldEventLoop();
    }

    if (lightPlayer && lightCriticalMoves >= MIN_CRITICAL_POSITIONS) {
      const score = lightCriticalMatches / lightCriticalMoves;
      if (score >= ENGINE_MATCH_THRESHOLD) {
        await this.flagUser(lightPlayer, 'ENGINE_CORRELATION', score,
          `Matched the engine's top move in ${lightCriticalMatches}/${lightCriticalMoves} critical positions (positions with a real choice, not forced/obvious ones)`,
          gameId ?? null, lightCriticalMoves);
      }
    }
    if (darkPlayer && darkCriticalMoves >= MIN_CRITICAL_POSITIONS) {
      const score = darkCriticalMatches / darkCriticalMoves;
      if (score >= ENGINE_MATCH_THRESHOLD) {
        await this.flagUser(darkPlayer, 'ENGINE_CORRELATION', score,
          `Matched the engine's top move in ${darkCriticalMatches}/${darkCriticalMoves} critical positions (positions with a real choice, not forced/obvious ones)`,
          gameId ?? null, darkCriticalMoves);
      }
    }
  }

  // Aggregates this player's own think-times across their recent game history PLUS
  // the game that was just completed (moveTimings/wasLight describe that one) — "many
  // games/moves", per the brief, not a single-game snapshot.
  private async analyzeMoveTimingForPlayer(player: User, wasLightInCurrentGame: boolean, currentGameTimings: number[] | undefined) {
    const recentGames = await this.historyService.getPlayerHistory(player.id);
    const allTimings: number[] = [];

    for (const game of recentGames) {
      if (!game.moveTimings) continue;
      const wasLight = game.lightPlayer?.id === player.id;
      allTimings.push(...this.extractOwnTimings(game.moveTimings, wasLight));
    }
    if (currentGameTimings) {
      allTimings.push(...this.extractOwnTimings(currentGameTimings, wasLightInCurrentGame));
    }

    const result = detectTimingAnomaly(allTimings);
    if (result.isAnomalous) {
      await this.flagUser(player, 'MOVE_TIMING', result.coefficientOfVariation,
        `Unnaturally consistent think-time across ${result.sampleSize} moves (coefficient of variation ${result.coefficientOfVariation.toFixed(3)}, below the ${MIN_TIMING_SAMPLES}-sample natural-play floor)`,
        null, result.sampleSize);
    }
  }

  // Light moves first (engine.service.ts), so a game's moves/moveTimings alternate
  // L, D, L, D, ... — even indices are Light's, odd are Dark's.
  private extractOwnTimings(moveTimings: number[], wasLight: boolean): number[] {
    return moveTimings.filter((_, i) => (i % 2 === 0) === wasLight);
  }

  private async flagUser(user: User, flagType: string, score: number, reason: string, gameId: number | null, sampleSize: number | null) {
    console.warn(`[AntiCheat] Flagging user ${user.username} for review (${flagType}). Score: ${score}`);
    const flag = this.cheatFlagRepository.create({
      user,
      flagType,
      score,
      reason,
      gameId,
      sampleSize,
    });
    await this.cheatFlagRepository.save(flag);
  }

  // ============================================================
  // Moderator review queue (Phase 12) — read side
  // ============================================================

  async getFlags(reviewed?: boolean): Promise<CheatFlag[]> {
    return this.cheatFlagRepository.find({
      where: reviewed === undefined ? {} : { reviewed },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async getFlag(id: number): Promise<CheatFlag | null> {
    return this.cheatFlagRepository.findOne({ where: { id }, relations: ['user'] });
  }

  async getFlagsForUser(userId: number): Promise<CheatFlag[]> {
    return this.cheatFlagRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  // ============================================================
  // Moderator action — the ONLY path that can ever change a User's moderation
  // status. Only reachable via AnticheatController's review endpoint, which requires
  // being logged in (no admin-role system exists in this codebase — same documented
  // simplification used throughout: Phase 7's puzzle admin routes, Phase 8b's
  // tournament lifecycle routes, etc.) and always a specific, deliberate human action
  // — never invoked by analyzeGameForCheating or anything else automated.
  // ============================================================

  async applyModeratorAction(
    flagId: number,
    moderatorUserId: number,
    action: 'DISMISS' | 'WARN' | 'RATING_RESET_FLAG' | 'TEMP_BAN' | 'PERMA_BAN',
    note?: string,
    tempBanDays?: number,
  ): Promise<CheatFlag> {
    const flag = await this.cheatFlagRepository.findOne({ where: { id: flagId }, relations: ['user'] });
    if (!flag) throw new NotFoundException('Flag not found');
    if (flag.reviewed) throw new BadRequestException('This flag has already been reviewed');

    const statusByAction: Record<string, string | null> = {
      DISMISS: null, // no change to the user's standing
      WARN: 'WARNED',
      RATING_RESET_FLAG: 'RATING_RESET_FLAGGED',
      TEMP_BAN: 'TEMP_BANNED',
      PERMA_BAN: 'PERMA_BANNED',
    };
    const newStatus = statusByAction[action];
    if (newStatus === undefined) throw new BadRequestException(`Unknown action: ${action}`);

    if (newStatus !== null) {
      if (action === 'TEMP_BAN' && (!tempBanDays || tempBanDays <= 0)) {
        throw new BadRequestException('tempBanDays is required and must be positive for a TEMP_BAN action');
      }
      const tempBanUntil = action === 'TEMP_BAN' ? new Date(Date.now() + tempBanDays! * 24 * 60 * 60 * 1000) : null;
      await this.usersService.applyModeration(flag.user.id, newStatus, note ?? null, tempBanUntil);
    }

    flag.reviewed = true;
    flag.reviewedByUserId = moderatorUserId;
    flag.moderatorNote = note ?? null;
    flag.moderatorAction = action;
    flag.reviewedAt = new Date();
    return this.cheatFlagRepository.save(flag);
  }
}
