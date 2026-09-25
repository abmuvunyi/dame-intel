import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { GameReviewService } from './game-review.service';
import { OptionalAuthGuard } from '../../auth/auth.guard';
import { UsersService } from '../../users/users.service';

@Controller('game-review')
export class GameReviewController {
  constructor(
    private readonly gameReviewService: GameReviewService,
    private readonly usersService: UsersService,
  ) {}

  // Deliberately open to guests (like GET /history/game/:id) — a game review is
  // exactly as public as the game itself already is. Phase 15: the engine's
  // "best continuation" / "how this gets punished" lines are a paid feature
  // (entitlements.fullGameReview); everyone still gets classifications and accuracy.
  @UseGuards(OptionalAuthGuard)
  @Get(':gameId')
  async getReview(@Req() req: any, @Param('gameId', ParseIntPipe) gameId: number) {
    const review = await this.gameReviewService.getReview(gameId);
    // No row yet distinguishes "never queued" (e.g. a 0-move game, or the async pass
    // hasn't started) from a genuinely completed review — the frontend treats both
    // "not found" and an explicit PENDING row as "analysis not ready yet".
    if (!review) return { gameId, status: 'NOT_STARTED' };
    const full = this.usersService.accessFor(req.authUser).entitlements.fullGameReview;
    if (full) return { ...review, linesIncluded: true };
    return {
      ...review,
      linesIncluded: false,
      moveReviews: (review.moveReviews ?? []).map((m) => ({ ...m, recommendedLine: null, punishmentLine: null })),
    };
  }
}
