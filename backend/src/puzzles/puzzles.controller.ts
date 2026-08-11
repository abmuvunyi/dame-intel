import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PuzzlesService } from './puzzles.service';
import { PuzzleRushService } from './puzzle-rush.service';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { AuthGuard } from '../auth/auth.guard';
import { jwtConstants } from '../auth/constants';
import type { Move } from '../game/engine/engine.service';

@Controller('puzzles')
export class PuzzlesController {
  constructor(
    private readonly puzzlesService: PuzzlesService,
    private readonly rushService: PuzzleRushService,
    private readonly generatorService: PuzzleGeneratorService,
    private readonly jwtService: JwtService,
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

  @Get('random')
  async getRandomPuzzle(@Query('difficulty') difficulty?: string) {
    const diff = difficulty ? parseInt(difficulty, 10) : undefined;
    return this.puzzlesService.getRandomPuzzle(diff);
  }

  @Get('rating')
  @UseGuards(AuthGuard)
  async getMyPuzzleRating(@Req() req: any) {
    return this.puzzlesService.getOrCreatePlayerRating(req.user.sub);
  }

  @Get(':id/legal-moves')
  async getLegalMoves(@Param('id', ParseIntPipe) id: number, @Query('moveIndex') moveIndex?: string) {
    return this.puzzlesService.getLegalMoves(id, moveIndex ? parseInt(moveIndex, 10) : 0);
  }

  @Post(':id/attempt')
  async attemptPuzzle(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { moveIndex: number; move: Move },
  ) {
    const userId = await this.optionalUserId(req);
    return this.puzzlesService.attemptMove(id, userId, body.moveIndex, body.move);
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
