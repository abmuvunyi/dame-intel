import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { PresenceService } from '../presence/presence.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presenceService: PresenceService,
  ) {}

  @Get('rankings')
  getRankings(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 100;
    return this.usersService.getRankings(l);
  }

  @Get('stats')
  getStats() {
    return this.usersService.getRatingStats();
  }

  // Home-dashboard "your global rank" widget — real data from the same rating column
  // /users/rankings already sorts by, not a separate invented number.
  @Get('rank')
  @UseGuards(AuthGuard)
  async getMyRank(@Request() req: any) {
    return this.usersService.getRankFor(req.user.sub);
  }

  // Home-dashboard "Recommended Match" card — the closest-rated player who's
  // currently online, sourced from PresenceService's real live-socket registry (the
  // same one FriendsService's "online" indicator already uses), not anything faked.
  @Get('recommended-match')
  @UseGuards(AuthGuard)
  async getRecommendedMatch(@Request() req: any) {
    const onlineUserIds = this.presenceService.getOnlineUserIds();
    return this.usersService.getRecommendedMatch(req.user.sub, onlineUserIds);
  }
}
