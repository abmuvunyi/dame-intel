import { BadRequestException, Controller, ForbiddenException, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AiService } from './ai/ai/ai.service';
import { DraughtsEngine, BoardState, PieceColor, GameRules } from './engine/engine.service';
import { authenticateToken, extractBearerToken } from '../auth/auth.guard';
import { UsersService } from '../users/users.service';

// Analysis depth depends on the caller's plan (billing/plans.ts →
// entitlements.analysisMaxDepth). Anonymous callers get the Free limit.
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
  private async resolveMaxDepth(req: Request): Promise<number> {
    const token = extractBearerToken(req);
    let user = null;
    if (token) {
      try {
        user = (await authenticateToken(token, this.jwtService, this.usersService)).user;
      } catch {
        user = null;
      }
    }
    return this.usersService.accessFor(user).entitlements.analysisMaxDepth;
  }

  @Post()
  async analyze(@Req() req: Request, @Body() body: { board: BoardState, turn: PieceColor, depth: number, rules?: Partial<GameRules> }) {
    // The board size (and with it, flying-kings/majority-capture/etc.) must match the
    // position being analyzed, not the engine's bare default (8x8). The caller may pass
    // `rules` explicitly; failing that, the submitted board's own dimensions are the
    // most reliable signal of which variant it belongs to.
    // Phase 14: reject malformed input before it reaches the (CPU-heavy) engine —
    // an arbitrary board size on this public endpoint was a cheap way to burn CPU.
    if (!Array.isArray(body?.board) || ![8, 10].includes(body.board.length)
        || !body.board.every((row) => Array.isArray(row) && row.length === body.board.length)) {
      throw new BadRequestException('board must be an 8x8 or 10x10 array.');
    }
    if (body.rules?.boardSize !== undefined && body.rules.boardSize !== body.board.length) {
      throw new BadRequestException('rules.boardSize does not match the submitted board.');
    }
    const boardSize = body.rules?.boardSize ?? body.board.length;
    const engine = new DraughtsEngine({ ...body.rules, boardSize });
    engine.loadBoard(body.board, body.turn);

    const maxDepth = await this.resolveMaxDepth(req);
    // Free's analysisMaxDepth is 0 (billing/plans.ts) — refuse outright rather than
    // silently running a trivial depth-0 (effectively depth-1) search, which would
    // still leak a real, if shallow, engine opinion to a tier that isn't supposed to
    // have any analysis access at all.
    if (maxDepth <= 0) {
      throw new ForbiddenException('Engine analysis requires a Plus or Premium plan.');
    }
    const requestedDepth = body.depth || DEFAULT_DEPTH;
    const depth = Math.min(requestedDepth, maxDepth);

    const evaluations = await this.aiService.analyzePositionAsync(engine, depth, 'interactive');

    return { evaluations, depthUsed: depth, depthCapped: depth < requestedDepth, maxDepth };
  }
}
