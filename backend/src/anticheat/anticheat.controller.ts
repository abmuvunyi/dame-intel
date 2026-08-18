import { Body, Controller, Get, Post, Param, ParseIntPipe, UseGuards, Request, Query } from '@nestjs/common';
import { AnticheatService } from './anticheat.service';
import { AuthGuard } from '../auth/auth.guard';

// Phase 12's moderator review queue. No admin-role system exists anywhere in this
// codebase — every route here just requires being logged in, the same bar every
// other "admin" surface in the app already uses (Phase 7's puzzle admin routes,
// Phase 8b's tournament lifecycle routes). A real role check is future work, not
// invented here as a side effect of this phase.
@Controller('anticheat/admin')
@UseGuards(AuthGuard)
export class AnticheatController {
  constructor(private readonly anticheatService: AnticheatService) {}

  // ?reviewed=false (default expectation for a review queue) | true | omitted for all
  @Get('flags')
  async getFlags(@Query('reviewed') reviewed?: string) {
    const filter = reviewed === undefined ? undefined : reviewed === 'true';
    return this.anticheatService.getFlags(filter);
  }

  @Get('flags/:id')
  async getFlag(@Param('id', ParseIntPipe) id: number) {
    return this.anticheatService.getFlag(id);
  }

  @Get('users/:userId/flags')
  async getFlagsForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.anticheatService.getFlagsForUser(userId);
  }

  @Post('flags/:id/review')
  async reviewFlag(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { action: 'DISMISS' | 'WARN' | 'RATING_RESET_FLAG' | 'TEMP_BAN' | 'PERMA_BAN', note?: string, tempBanDays?: number },
  ) {
    return this.anticheatService.applyModeratorAction(id, req.user.sub, body.action, body.note, body.tempBanDays);
  }
}
