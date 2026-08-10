import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RatingService } from './rating.service';

@Controller('rating')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  // Current rating (and provisional status) in every pool this player has ever
  // played a rated game in.
  @Get(':userId')
  async getCurrent(@Param('userId', ParseIntPipe) userId: number) {
    return this.ratingService.getCurrentRatings(userId);
  }

  // Full rating-over-time history, optionally narrowed to one pool — enough to draw
  // a rating graph either across everything or per (variant, timeControl).
  @Get(':userId/history')
  async getHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('variant') variant?: string,
    @Query('timeControl') timeControl?: string,
  ) {
    return this.ratingService.getHistory(userId, variant, timeControl);
  }
}
