import { Controller, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { GameReviewService } from './game-review.service';
import { AuthGuard, OptionalAuthGuard } from '../../auth/auth.guard';
import { UsersService } from '../../users/users.service';
import { AuditService } from '../../audit/audit.service';
import { freeReviewState } from '../../billing/free-review';

@Controller('game-review')
export class GameReviewController {
  constructor(
    private readonly gameReviewService: GameReviewService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  // Open to guests (like GET /history/game/:id); the answer depends on the plan.
  // The whole review (classifications, accuracy, eval bar, lines) needs Plus or
  // Premium — or the Free plan's one free review per 24h, spent on this game.
  @UseGuards(OptionalAuthGuard)
  @Get(':gameId')
  async getReview(@Req() req: any, @Param('gameId', ParseIntPipe) gameId: number) {
    const user = req.authUser;
    const full = this.usersService.accessFor(user).entitlements.fullGameReview;
    const free = freeReviewState(user, gameId);
    if (!full && !free.unlocked) {
      // PLUS is the cheapest current plan with fullGameReview.
      return {
        gameId,
        status: 'LOCKED',
        requiresPlan: 'PLUS',
        freeReview: { signInRequired: !user, available: free.available, nextAvailableAt: free.nextAvailableAt },
      };
    }
    return this.reviewPayload(gameId, full ? null : free.unlockedUntil);
  }

  // Spend the Free plan's daily review on this game. Idempotent for the game it was
  // already spent on.
  @UseGuards(AuthGuard)
  @Post(':gameId/free-review')
  async useFreeReview(@Req() req: any, @Param('gameId', ParseIntPipe) gameId: number) {
    const user = req.authUser;
    if (this.usersService.accessFor(user).entitlements.fullGameReview) {
      return this.reviewPayload(gameId, null);
    }
    const now = new Date();
    const free = freeReviewState(user, gameId, now);
    if (free.unlocked) return this.reviewPayload(gameId, free.unlockedUntil);
    if (!free.available) {
      throw new ForbiddenException({
        message: 'Your free review for today is already used.',
        nextAvailableAt: free.nextAvailableAt,
      });
    }
    if (!(await this.gameReviewService.gamePositionKeys(gameId))) throw new NotFoundException('Game not found.');

    const updated = await this.usersService.useFreeReview(user.id, gameId, now);
    await this.audit.record({ action: 'review.free_used', actorUserId: user.id, targetType: 'game', targetId: gameId, req });
    return this.reviewPayload(gameId, freeReviewState(updated, gameId, now).unlockedUntil);
  }

  private async reviewPayload(gameId: number, freeReviewUntil: Date | null) {
    const extra = freeReviewUntil ? { freeReview: { unlockedUntil: freeReviewUntil } } : {};
    const review = await this.gameReviewService.getReview(gameId);
    // No row yet: never queued (e.g. a 0-move game) or the async pass hasn't started.
    if (!review) return { gameId, status: 'NOT_STARTED', ...extra };
    return { ...review, linesIncluded: true, ...extra };
  }
}
