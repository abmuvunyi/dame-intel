import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PuzzlesService } from './puzzles.service';
import { PuzzleRushService } from './puzzle-rush.service';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { AuthGuard } from '../auth/auth.guard';
import { jwtConstants } from '../auth/constants';
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
  ) {}

  // Puzzle solving is open to anonymous play, same as vs-AI games — but attempts from
  // a logged-in player feed their own puzzle rating (see puzzles.service.ts). This
  // mirrors game.gateway.ts's handleConnection: verify a bearer token if present,
  // proceed as anonymous if it's missing or invalid, never throw either way.
  private async optionalUserId(req: Request): Promise<number | null> {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: jwtConstants.secret });
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

  // --- Admin / review flow ---
  // No admin-role system exists in this codebase yet (User has no isAdmin flag) — these
  // endpoints just require being logged in, same bar as the rest of the app's
  // authenticated actions. A real admin gate is future work, not invented here as a
  // side effect of this phase.

  @Get('admin/pending')
  @UseGuards(AuthGuard)
  async listPending() {
    return this.puzzlesService.listPending();
  }

  @Post('admin/:id/approve')
  @UseGuards(AuthGuard)
  async approvePuzzle(@Param('id', ParseIntPipe) id: number) {
    return this.puzzlesService.setStatus(id, 'published');
  }

  // Phase 13: marks a puzzle premium-only (or reverts it) — same "logged in is
  // enough" admin bar as everything else in this section.
  @Post('admin/:id/set-premium')
  @UseGuards(AuthGuard)
  async setPuzzlePremium(@Param('id', ParseIntPipe) id: number, @Body() body: { isPremium: boolean }) {
    return this.puzzlesService.setPremium(id, !!body.isPremium);
  }

  @Post('admin/:id/reject')
  @UseGuards(AuthGuard)
  async rejectPuzzle(@Param('id', ParseIntPipe) id: number) {
    return this.puzzlesService.setStatus(id, 'rejected');
  }

  @Post('admin/generate/:gameId')
  @UseGuards(AuthGuard)
  async generateFromGame(@Param('gameId', ParseIntPipe) gameId: number) {
    return this.generatorService.scanGame(gameId);
  }

  @Post('admin/generate-recent')
  @UseGuards(AuthGuard)
  async generateFromRecentGames(@Query('limit') limit?: string) {
    return this.generatorService.scanRecentGames(limit ? parseInt(limit, 10) : undefined);
  }
}
