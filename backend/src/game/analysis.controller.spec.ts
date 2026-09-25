import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisController } from './analysis.controller';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { DraughtsEngine, PieceColor, PieceType, BoardState } from './engine/engine.service';
import { accessFor } from '../billing/access';

function fakeRequest(token?: string): any {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let jwtService: { verifyAsync: jest.Mock };
  let usersService: { findOneById: jest.Mock, accessFor: jest.Mock, isCurrentlyBanned: jest.Mock };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    usersService = {
      findOneById: jest.fn(),
      // Phase 15: the real plan/trial resolution, not a stand-in.
      accessFor: jest.fn((user: any) => accessFor(user)),
      isCurrentlyBanned: jest.fn(() => false),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
        AiService,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    controller = module.get<AnalysisController>(AnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('analyzes an 8x8 board using 8x8 rules', async () => {
    const engine = DraughtsEngine.createAmerican();
    const { evaluations } = await controller.analyze(fakeRequest(), { board: engine.getBoard(), turn: PieceColor.LIGHT, depth: 2 });
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
    const { evaluations } = await controller.analyze(fakeRequest(), { board, turn: PieceColor.LIGHT, depth: 1 });
    expect(evaluations.length).toBeGreaterThan(0);
    expect(evaluations.some(({ move }) => move.from.row === 9)).toBe(true);
  });

  // Depth capped by plan (billing/plans.ts): Free 4, Premium 6, Pro 8.
  describe('analysis-depth gate (by plan)', () => {
    const board = DraughtsEngine.createAmerican().getBoard();

    it('an anonymous caller (no token at all) is capped at the free depth', async () => {
      const result = await controller.analyze(fakeRequest(), { board, turn: PieceColor.LIGHT, depth: 8 });
      expect(result.depthUsed).toBe(4);
      expect(result.depthCapped).toBe(true);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('a logged-in FREE user is capped at the free depth too', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 1 });
      usersService.findOneById.mockResolvedValue({ id: 1, membershipTier: 'FREE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 8 });
      expect(result.depthUsed).toBe(4);
      expect(result.depthCapped).toBe(true);
    });

    it('a PREMIUM user can request up to the higher premium ceiling', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 2 });
      usersService.findOneById.mockResolvedValue({ id: 2, membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 6 });
      expect(result.depthUsed).toBe(6); // not capped — 6 <= premium ceiling
      expect(result.depthCapped).toBe(false);
    });

    it('even a PREMIUM user is capped at the premium ceiling, not truly unlimited', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 2 });
      usersService.findOneById.mockResolvedValue({ id: 2, membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.depthUsed).toBe(result.maxDepth);
      expect(result.depthCapped).toBe(true);
    });

    it('a PRO subscriber gets the deepest analysis', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 3 });
      usersService.findOneById.mockResolvedValue({ id: 3, membershipTier: 'PRO', membershipStatus: 'ACTIVE' });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.maxDepth).toBe(8);
    });

    it('a player on an active free trial gets the trial plan\'s depth', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 4 });
      usersService.findOneById.mockResolvedValue({
        id: 4, trialPlan: 'PREMIUM', trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 86_400_000),
      });
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.maxDepth).toBe(6);
    });

    it('a banned user\'s token counts as anonymous', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 5 });
      usersService.findOneById.mockResolvedValue({ id: 5, membershipTier: 'PRO', membershipStatus: 'ACTIVE' });
      usersService.isCurrentlyBanned.mockReturnValue(true);
      const result = await controller.analyze(fakeRequest('token'), { board, turn: PieceColor.LIGHT, depth: 20 });
      expect(result.maxDepth).toBe(4);
    });

    it('an invalid/expired token is treated as anonymous, not an error', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));
      const result = await controller.analyze(fakeRequest('garbage'), { board, turn: PieceColor.LIGHT, depth: 8 });
      expect(result.depthUsed).toBe(4);
    });

    it('a request that never asks for more than the free cap is never marked capped', async () => {
      const result = await controller.analyze(fakeRequest(), { board, turn: PieceColor.LIGHT, depth: 4 });
      expect(result.depthCapped).toBe(false);
    });
  });
});
