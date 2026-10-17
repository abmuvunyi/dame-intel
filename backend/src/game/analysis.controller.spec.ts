import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisController } from './analysis.controller';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { DraughtsEngine, PieceColor, PieceType, BoardState } from './engine/engine.service';
import { accessFor } from '../billing/access';
import { GameReviewService, positionKey } from './review/game-review.service';

function fakeRequest(token?: string): any {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let jwtService: { verifyAsync: jest.Mock };
  let usersService: { findOneById: jest.Mock, accessFor: jest.Mock, isCurrentlyBanned: jest.Mock };
  let gameReviewService: { gamePositionKeys: jest.Mock };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    usersService = {
      findOneById: jest.fn(),
      // Phase 15: the real plan/trial resolution, not a stand-in.
      accessFor: jest.fn((user: any) => accessFor(user)),
      isCurrentlyBanned: jest.fn(() => false),
    };
    // Game 42 is the opening position followed by one move.
    const game = DraughtsEngine.createAmerican();
    const keys = new Set([positionKey(game)]);
    game.makeMove(game.getLegalMoves()[0]);
    keys.add(positionKey(game));
    gameReviewService = { gamePositionKeys: jest.fn(async (id: number) => (id === 42 ? keys : null)) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
        AiService,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        { provide: GameReviewService, useValue: gameReviewService },
      ],
    }).compile();

    controller = module.get<AnalysisController>(AnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Smoke tests need a non-Free requester now that Free has zero analysis access
  // (see the gate tests below) — an authenticated PLUS user, so these two keep
  // testing analyze()'s own board-handling logic in isolation from the plan gate.
  function plusRequest() {
    jwtService.verifyAsync.mockResolvedValue({ sub: 1 });
    usersService.findOneById.mockResolvedValue({ id: 1, membershipTier: 'PLUS', membershipStatus: 'ACTIVE' });
    return fakeRequest('token');
  }

  it('analyzes an 8x8 board using 8x8 rules', async () => {
    const engine = DraughtsEngine.createAmerican();
    const { evaluations } = await controller.analyze(plusRequest(), { board: engine.getBoard(), turn: PieceColor.LIGHT, depth: 2 });
    expect(evaluations.length).toBeGreaterThan(0);
    for (const { move } of evaluations) {
      expect(move.from.row).toBeLessThan(8);
      expect(move.to.row).toBeLessThan(8);
    }
  });

  // Regression test: analyze() used to construct `new DraughtsEngine()` with no rules at
  // all, defaulting to an 8x8 board regardless of what was submitted. getLegalMoves()'s
  // own scan is bounded by rules.boardSize, so a piece sitting on row 9 of a 10x10 board
  // would have been completely invisible to move generation under that bug — not just
  // clipped, but silently skipped entirely, before analysis even started.
  it('analyzes a 10x10 board using 10x10 rules, not the 8x8 default', async () => {
    const board: BoardState = Array(10).fill(null).map(() => Array(10).fill(null));
    board[9][0] = { color: PieceColor.LIGHT, type: PieceType.MAN };
    const { evaluations } = await controller.analyze(plusRequest(), { board, turn: PieceColor.LIGHT, depth: 1 });
    expect(evaluations.length).toBeGreaterThan(0);
    expect(evaluations.some(({ move }) => move.from.row === 9)).toBe(true);
  });

  // Depth/access gated by plan (billing/plans.ts): Free has NO analysis access at
  // all (analysisMaxDepth: 0 — a real product decision, 2026-09: analysis used to be
  // free up to depth 4), Plus 6, Premium 8.
  describe('analysis-depth gate (by plan)', () => {
    const board = DraughtsEngine.createAmerican().getBoard();

    it('an anonymous caller (no token at all) is refused outright — Free has no analysis access', async () => {
      await expect(controller.analyze(fakeRequest(), { board, turn: PieceColor.LIGHT, depth: 8 }))
        .rejects.toThrow('Engine analysis requires a Plus or Premium plan.');
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('a logged-in FREE user is refused too', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 1 });
      usersService.findOneById.mockResolvedValue({ id: 1, membershipTier: 'FREE' });
      await expect(controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 8 }))
        .rejects.toThrow('Engine analysis requires a Plus or Premium plan.');
    });

    it('a PLUS user can request up to their ceiling', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 2 });
      usersService.findOneById.mockResolvedValue({ id: 2, membershipTier: 'PLUS', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 6 });
      expect(result.depthUsed).toBe(6); // not capped — 6 <= Plus ceiling
      expect(result.depthCapped).toBe(false);
    });

    it('even a PLUS user is capped at their own ceiling, not truly unlimited', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 2 });
      usersService.findOneById.mockResolvedValue({ id: 2, membershipTier: 'PLUS', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.depthUsed).toBe(result.maxDepth);
      expect(result.depthCapped).toBe(true);
    });

    it('a PREMIUM subscriber gets the deepest analysis', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 3 });
      usersService.findOneById.mockResolvedValue({ id: 3, membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.maxDepth).toBe(8);
    });

    it('a player on an active free trial gets the trial plan\'s depth', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 4 });
      usersService.findOneById.mockResolvedValue({
        id: 4, trialPlan: 'PLUS', trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 86_400_000),
      });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.maxDepth).toBe(6);
    });

    it('a banned user\'s token counts as anonymous — refused, same as Free', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 5 });
      usersService.findOneById.mockResolvedValue({ id: 5, membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE' });
      usersService.isCurrentlyBanned.mockReturnValue(true);
      await expect(controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 }))
        .rejects.toThrow('Engine analysis requires a Plus or Premium plan.');
    });

    it('an invalid/expired token is treated as anonymous, not an error — still refused, not a 500', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));
      await expect(controller.analyze(fakeRequest('garbage'), { board, turn: PieceColor.LIGHT, depth: 8 }))
        .rejects.toThrow('Engine analysis requires a Plus or Premium plan.');
    });

    it('a request within a PLUS user\'s own ceiling is never marked capped', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 6 });
      usersService.findOneById.mockResolvedValue({ id: 6, membershipTier: 'PLUS', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 4 });
      expect(result.depthCapped).toBe(false);
    });
  });

  // Free plan's daily free review (billing/free-review.ts) also unlocks engine
  // analysis — but only of positions from the game it was spent on.
  describe('analysis under a Free daily review', () => {
    function freeUserWithReviewOn(gameId: number, hoursAgo = 1) {
      jwtService.verifyAsync.mockResolvedValue({ sub: 7 });
      usersService.findOneById.mockResolvedValue({
        id: 7, membershipTier: 'FREE', lastFreeReviewGameId: gameId,
        lastFreeReviewAt: new Date(Date.now() - hoursAgo * 3_600_000),
      });
      return fakeRequest('token');
    }
    const start = () => DraughtsEngine.createAmerican();

    it('allows Plus depth on a position from the unlocked game', async () => {
      const res = await controller.analyze(freeUserWithReviewOn(42), { board: start().getBoard(), turn: PieceColor.LIGHT, depth: 8, gameId: 42 });
      expect(res.depthUsed).toBe(6);
      expect(res.evaluations.length).toBeGreaterThan(0);
    });

    it('refuses a position that is not from that game', async () => {
      const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
      board[5][0] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      await expect(controller.analyze(freeUserWithReviewOn(42), { board, turn: PieceColor.LIGHT, depth: 4, gameId: 42 }))
        .rejects.toThrow('Engine analysis requires a Plus or Premium plan.');
    });

    it('refuses without a gameId, for another game, and after 24h', async () => {
      const body = { board: start().getBoard(), turn: PieceColor.LIGHT, depth: 4 };
      await expect(controller.analyze(freeUserWithReviewOn(42), body)).rejects.toThrow(/Plus or Premium/);
      await expect(controller.analyze(freeUserWithReviewOn(43), { ...body, gameId: 42 })).rejects.toThrow(/Plus or Premium/);
      await expect(controller.analyze(freeUserWithReviewOn(42, 25), { ...body, gameId: 42 })).rejects.toThrow(/Plus or Premium/);
    });

    it('refuses an anonymous caller even with a gameId', async () => {
      await expect(controller.analyze(fakeRequest(), { board: start().getBoard(), turn: PieceColor.LIGHT, depth: 4, gameId: 42 }))
        .rejects.toThrow(/Plus or Premium/);
    });
  });
});
