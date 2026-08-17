import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { GameReviewService } from './game-review.service';

@Controller('game-review')
export class GameReviewController {
  constructor(private readonly gameReviewService: GameReviewService) {}

  // Deliberately unauthenticated (like GET /history/game/:id) — a game review is
  // exactly as public as the game itself already is.
  @Get(':gameId')
  async getReview(@Param('gameId', ParseIntPipe) gameId: number) {
    const review = await this.gameReviewService.getReview(gameId);
    // No row yet distinguishes "never queued" (e.g. a 0-move game, or the async pass
    // hasn't started) from a genuinely completed review — the frontend treats both
    // "not found" and an explicit PENDING row as "analysis not ready yet".
    return review ?? { gameId, status: 'NOT_STARTED' };
  }
}
