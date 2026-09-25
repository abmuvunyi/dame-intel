import { Body, Controller, Get, Optional, Post, Param, ParseIntPipe, UseGuards, Request, Query } from '@nestjs/common';
import { AnticheatService } from './anticheat.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../access/permissions.guard';
import { PERMISSIONS } from '../access/roles';
import { AuditService } from '../audit/audit.service';
import { ReviewFlagDto } from './review-flag.dto';

// Phase 12's moderator review queue. Phase 15: requires the moderation.review
// permission (MODERATOR or ADMIN role). Every decision is written to the audit trail.
@Controller('anticheat/admin')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.MODERATION_REVIEW)
export class AnticheatController {
  constructor(
    private readonly anticheatService: AnticheatService,
    @Optional() private readonly audit?: AuditService,
  ) {}

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
    @Body() body: ReviewFlagDto,
  ) {
    const result = await this.anticheatService.applyModeratorAction(id, req.user.sub, body.action, body.note, body.tempBanDays);
    await this.audit?.record({
      action: 'moderation.action',
      actorUserId: req.user.sub,
      targetType: 'cheat_flag',
      targetId: id,
      details: { decision: body.action, tempBanDays: body.tempBanDays ?? null, note: body.note ?? null, flaggedUserId: (result as any)?.userId ?? null },
      req,
    });
    return result;
  }
}
