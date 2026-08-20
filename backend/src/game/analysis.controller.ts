import { Controller, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AiService } from './ai/ai/ai.service';
import { DraughtsEngine, BoardState, PieceColor, GameRules } from './engine/engine.service';
import { jwtConstants } from '../auth/constants';
import { UsersService } from '../users/users.service';

// Phase 13: the other feature actually gated behind PREMIUM (alongside exclusive
// puzzles — see puzzles.service.ts). FREE_MAX_DEPTH matches the endpoint's
// pre-Phase-13 default exactly, so an anonymous or free caller who never requests
// more than the default sees byte-for-byte the same behavior as before this phase —
// the cap only engages if someone actually asks for more.
const FREE_MAX_DEPTH = 4;
const PREMIUM_MAX_DEPTH = 8; // matches AiService's own difficulty-7 depth elsewhere in the app
const DEFAULT_DEPTH = 4;

@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  // Same optional-auth shape used in puzzles.controller.ts and game.gateway.ts's
  // handleConnection — this endpoint stays open to anonymous callers (the analysis
  // board itself needs no login, per Phase 3/11), it just resolves who's asking so
  // the depth cap below can apply.
  private async resolveHasPremium(req: Request): Promise<boolean> {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return false;
    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: jwtConstants.secret });
      const user = await this.usersService.findOneById(payload.sub);
      return this.usersService.hasPremium(user);
    } catch {
      return false;
    }
  }

  @Post()
  async analyze(@Req() req: Request, @Body() body: { board: BoardState, turn: PieceColor, depth: number, rules?: Partial<GameRules> }) {
    // The board size (and with it, flying-kings/majority-capture/etc.) must match the
    // position being analyzed, not the engine's bare default (8x8). The caller may pass
    // `rules` explicitly; failing that, the submitted board's own dimensions are the
    // most reliable signal of which variant it belongs to.
    const boardSize = body.rules?.boardSize ?? body.board.length;
    const engine = new DraughtsEngine({ ...body.rules, boardSize });
    engine.loadBoard(body.board, body.turn);

    const hasPremium = await this.resolveHasPremium(req);
    const maxDepth = hasPremium ? PREMIUM_MAX_DEPTH : FREE_MAX_DEPTH;
    const requestedDepth = body.depth || DEFAULT_DEPTH;
    const depth = Math.min(requestedDepth, maxDepth);

    const evaluations = this.aiService.analyzePosition(engine, depth);

    return { evaluations, depthUsed: depth, depthCapped: depth < requestedDepth, maxDepth };
  }
}
