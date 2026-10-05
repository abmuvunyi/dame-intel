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

  // Deliberately open to guests (like GET /history/game/:id) — resolving WHO's
  // asking still requires no login, same as the rest of this endpoint's auth shape;
  // it's the ANSWER that's now gated. Product decision (2026-09): game review used
  // to be free for everyone, with only the "best continuation"/"how this gets
  // punished" lines paid — now the whole review (classifications, accuracy, eval
  // bar) requires Plus or Premium, matching analysis access.
  @UseGuards(OptionalAuthGuard)
  @Get(':gameId')
  async getReview(@Req() req: any, @Param('gameId', ParseIntPipe) gameId: number) {
    const full = this.usersService.accessFor(req.authUser).entitlements.fullGameReview;
    if (!full) {
      // PLUS is the cheapest current plan with fullGameReview — both paid plans have
      // it today, so this is the correct "upgrade to at least ___" answer as long as
      // that stays true; revisit if a future plan version ever splits it further.
      return { gameId, status: 'LOCKED', requiresPlan: 'PLUS' };
    }
    const review = await this.gameReviewService.getReview(gameId);
    // No row yet distinguishes "never queued" (e.g. a 0-move game, or the async pass
    // hasn't started) from a genuinely completed review — the frontend treats both
    // "not found" and an explicit PENDING row as "analysis not ready yet".
    if (!review) return { gameId, status: 'NOT_STARTED' };
    return { ...review, linesIncluded: true };
  }
}