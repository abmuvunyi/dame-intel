import { Body, Controller, Get, Optional, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PuzzlesService } from './puzzles.service';
import { PuzzleRushService } from './puzzle-rush.service';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { AuthGuard } from '../auth/auth.guard';
import { authenticateToken, extractBearerToken } from '../auth/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../access/permissions.guard';
import { PERMISSIONS } from '../access/roles';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import type { Move } from '../game/engine/engine.service';

@Controller('puzzles')
export class PuzzlesController {
  constructor(
    private readonly puzzlesService: PuzzlesService,
    private readonly rushService: PuzzleRushService,
    private readonly generatorService: PuzzleGeneratorService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  // Puzzle solving is open to anonymous play, same as vs-AI games — but attempts from
  // a logged-in player feed their own puzzle rating (see puzzles.service.ts). This
  // mirrors game.gateway.ts's handleConnection: verify a bearer token if present,
  // proceed as anonymous if it's missing or invalid, never throw either way.
  private async optionalUserId(req: Request): Promise<number | null> {
    const token = extractBearerToken(req);
    if (!token) return null;
    try {
      // Phase 15: same checks as AuthGuard (banned / revoked sessions count as anonymous).
      const { payload } = await authenticateToken(token, this.jwtService, this.usersService);
      return payload.sub;
    } catch {
      return null;
    }
  }

  // Phase 13: same optional-auth shape as optionalUserId above, resolved one step
  // further into "does this (possibly anonymous) caller have premium access" — the
  // one feature-flag check every gated puzzle route below goes through.
  private async optionalHasPremium(req: Request): Promise<boolean> {
    const userId = await this.optionalUserId(req);
    if (!userId) return false;
    const user = await this.usersService.findOneById(userId);
    return this.usersService.hasPremium(user);
  }

  // No auth needed and deliberately not premium-gated — see PuzzlesService.getDailyPuzzle.
  @Get('daily')
  async getDailyPuzzle() {
    return this.puzzlesService.getDailyPuzzle();
  }

  @Get('random')
  async getRandomPuzzle(@Req() req: Request, @Query('difficulty') difficulty?: string) {
    const diff = difficulty ? parseInt(difficulty, 10) : undefined;
    const hasPremium = await this.optionalHasPremium(req);
    return this.puzzlesService.getRandomPuzzle(diff, hasPremium);
  }

  @Get('rating')
  @UseGuards(AuthGuard)
  async getMyPuzzleRating(@Req() req: any) {
    return this.puzzlesService.getOrCreatePlayerRating(req.user.sub);
  }

  @Get(':id/legal-moves')
  async getLegalMoves(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Query('moveIndex') moveIndex?: string) {
    const hasPremium = await this.optionalHasPremium(req);
    return this.puzzlesService.getLegalMoves(id, moveIndex ? parseInt(moveIndex, 10) : 0, hasPremium);
  }

  @Post(':id/attempt')
  async attemptPuzzle(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { moveIndex: number; move: Move },
  ) {
    const userId = await this.optionalUserId(req);
    const hasPremium = userId ? this.usersService.hasPremium(await this.usersService.findOneById(userId)) : false;
    return this.puzzlesService.attemptMove(id, userId, body.moveIndex, body.move, hasPremium);
  }

  // --- Puzzle Rush / Storm ---

  @Post('rush/start')
  async startRush(@Req() req: Request, @Body() body: { durationSeconds?: number }) {
    const userId = await this.optionalUserId(req);
    return this.rushService.start(userId, body?.durationSeconds);
  }

  @Post('rush/:sessionId/attempt')
  async rushAttempt(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() body: { moveIndex: number; move: Move },
  ) {
    return this.rushService.attempt(sessionId, body.moveIndex, body.move);
  }

  @Get('rush/:sessionId')
  async getRushSession(@Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.rushService.getSession(sessionId);
  }

  // --- Content management (review flow) ---
  // Phase 15: requires the puzzles.manage permission (CONTENT_EDITOR or ADMIN role).
  // State-changing actions are recorded in the audit trail.

  @Get('admin/pending')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
  async listPending() {
    return this.puzzlesService.listPending();
  }

  @Post('admin/:id/approve')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
  async approvePuzzle(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const result = await this.puzzlesService.setStatus(id, 'published');
    await this.audit?.record({ action: 'puzzle.approved', actorUserId: req.user.sub, targetType: 'puzzle', targetId: id, req });
    return result;
  }

  // Phase 13: marks a puzzle premium-only (or reverts it).
  @Post('admin/:id/set-premium')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
  async setPuzzlePremium(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: { isPremium: boolean }) {
    const result = await this.puzzlesService.setPremium(id, !!body.isPremium);
    await this.audit?.record({
      action: 'puzzle.premium_changed', actorUserId: req.user.sub, targetType: 'puzzle', targetId: id,
      details: { isPremium: !!body.isPremium }, req,
    });
    return result;
  }

  @Post('admin/:id/reject')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
  async rejectPuzzle(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const result = await this.puzzlesService.setStatus(id, 'rejected');
    await this.audit?.record({ action: 'puzzle.rejected', actorUserId: req.user.sub, targetType: 'puzzle', targetId: id, req });
    return result;
  }

  @Post('admin/generate/:gameId')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
  async generateFromGame(@Param('gameId', ParseIntPipe) gameId: number) {
    return this.generatorService.scanGame(gameId);
  }

  @Post('admin/generate-recent')
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.PUZZLES_MANAGE)
  async generateFromRecentGames(@Query('limit') limit?: string) {
    return this.generatorService.scanRecentGames(limit ? parseInt(limit, 10) : undefined);
  }
}
