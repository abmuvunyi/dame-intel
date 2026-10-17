import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GameReviewController } from './game-review.controller';
import { GameReviewService } from './game-review.service';
import { UsersService } from '../../users/users.service';
import { AuditService } from '../../audit/audit.service';
import { accessFor } from '../../billing/access';

const HOUR = 3_600_000;

describe('GameReviewController', () => {
  let controller: GameReviewController;
  let gameReviewService: { getReview: jest.Mock; gamePositionKeys: jest.Mock };
  let usersService: { accessFor: jest.Mock; useFreeReview: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    gameReviewService = {
      getReview: jest.fn().mockResolvedValue({ gameId: 42, status: 'COMPLETED', moveReviews: [] }),
      gamePositionKeys: jest.fn().mockResolvedValue(new Set(['start'])),
    };
    // Real plan/entitlement resolution (billing/access.ts), not a stand-in.
    usersService = {
      accessFor: jest.fn((user: any) => accessFor(user)),
      useFreeReview: jest.fn(async (id: number, gameId: number, at: Date) => ({ id, membershipTier: 'FREE', lastFreeReviewAt: at, lastFreeReviewGameId: gameId })),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameReviewController],
      providers: [
        { provide: GameReviewService, useValue: gameReviewService },
        { provide: UsersService, useValue: usersService },
        { provide: AuditService, useValue: audit },
        // The guards on the controller are constructed at compile time and need these.
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<GameReviewController>(GameReviewController);
  });

  describe('GET :gameId', () => {
    it('is LOCKED for an anonymous viewer (sign in for the free review), without reading the review', async () => {
      const result: any = await controller.getReview({ authUser: null }, 42);
      expect(result).toEqual({
        gameId: 42, status: 'LOCKED', requiresPlan: 'PLUS',
        freeReview: { signInRequired: true, available: false, nextAvailableAt: null },
      });
      expect(gameReviewService.getReview).not.toHaveBeenCalled();
    });

    it('is LOCKED for a Free user who has not spent the free review, and says one is available', async () => {
      const result: any = await controller.getReview({ authUser: { id: 1, membershipTier: 'FREE' } }, 42);
      expect(result.status).toBe('LOCKED');
      expect(result.freeReview).toEqual({ signInRequired: false, available: true, nextAvailableAt: null });
    });

    it('unlocks the game the free review was spent on, within 24h', async () => {
      const at = new Date(Date.now() - 2 * HOUR);
      const user = { id: 1, membershipTier: 'FREE', lastFreeReviewAt: at, lastFreeReviewGameId: 42 };
      const result: any = await controller.getReview({ authUser: user }, 42);
      expect(result.status).toBe('COMPLETED');
      expect(result.linesIncluded).toBe(true);
      expect(new Date(result.freeReview.unlockedUntil).getTime()).toBe(at.getTime() + 24 * HOUR);
    });

    it('keeps other games LOCKED while the free review is in use, with the time the next one is available', async () => {
      const at = new Date(Date.now() - 2 * HOUR);
      const user = { id: 1, membershipTier: 'FREE', lastFreeReviewAt: at, lastFreeReviewGameId: 42 };
      const result: any = await controller.getReview({ authUser: user }, 43);
      expect(result.status).toBe('LOCKED');
      expect(result.freeReview.available).toBe(false);
      expect(new Date(result.freeReview.nextAvailableAt).getTime()).toBe(at.getTime() + 24 * HOUR);
    });

    it('locks the old game again after 24h, and offers a new free review', async () => {
      const user = { id: 1, membershipTier: 'FREE', lastFreeReviewAt: new Date(Date.now() - 25 * HOUR), lastFreeReviewGameId: 42 };
      const result: any = await controller.getReview({ authUser: user }, 42);
      expect(result.status).toBe('LOCKED');
      expect(result.freeReview.available).toBe(true);
    });

    it('returns the full review for PLUS and PREMIUM, with no free-review marker', async () => {
      for (const tier of ['PLUS', 'PREMIUM']) {
        const result: any = await controller.getReview({ authUser: { membershipTier: tier, membershipStatus: 'ACTIVE' } }, 42);
        expect(result.status).toBe('COMPLETED');
        expect(result.linesIncluded).toBe(true);
        expect(result.freeReview).toBeUndefined();
      }
    });

    it('reports NOT_STARTED (not LOCKED) for an entitled viewer whose review does not exist yet', async () => {
      gameReviewService.getReview.mockResolvedValue(null);
      const result = await controller.getReview({ authUser: { membershipTier: 'PLUS', membershipStatus: 'ACTIVE' } }, 44);
      expect(result).toEqual({ gameId: 44, status: 'NOT_STARTED' });
    });

    it('is LOCKED for a canceled subscriber', async () => {
      const result: any = await controller.getReview({ authUser: { id: 2, membershipTier: 'PLUS', membershipStatus: 'CANCELED' } }, 45);
      expect(result.status).toBe('LOCKED');
    });
  });

  describe('POST :gameId/free-review', () => {
    it('spends the free review on this game, records it, and returns the review', async () => {
      const result: any = await controller.useFreeReview({ authUser: { id: 1, membershipTier: 'FREE' } }, 42);
      expect(usersService.useFreeReview).toHaveBeenCalledWith(1, 42, expect.any(Date));
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'review.free_used', targetId: 42 }));
      expect(result.status).toBe('COMPLETED');
      expect(result.freeReview.unlockedUntil).toBeInstanceOf(Date);
    });

    it('is idempotent for the game it was already spent on', async () => {
      const user = { id: 1, membershipTier: 'FREE', lastFreeReviewAt: new Date(Date.now() - HOUR), lastFreeReviewGameId: 42 };
      const result: any = await controller.useFreeReview({ authUser: user }, 42);
      expect(result.status).toBe('COMPLETED');
      expect(usersService.useFreeReview).not.toHaveBeenCalled();
    });

    it('refuses a second game within 24h', async () => {
      const user = { id: 1, membershipTier: 'FREE', lastFreeReviewAt: new Date(Date.now() - HOUR), lastFreeReviewGameId: 42 };
      await expect(controller.useFreeReview({ authUser: user }, 43)).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersService.useFreeReview).not.toHaveBeenCalled();
    });

    it('does not spend the free review on a game that does not exist', async () => {
      gameReviewService.gamePositionKeys.mockResolvedValue(null);
      await expect(controller.useFreeReview({ authUser: { id: 1, membershipTier: 'FREE' } }, 999)).rejects.toBeInstanceOf(NotFoundException);
      expect(usersService.useFreeReview).not.toHaveBeenCalled();
    });

    it('never spends anything for a paid plan', async () => {
      const result: any = await controller.useFreeReview({ authUser: { id: 3, membershipTier: 'PLUS', membershipStatus: 'ACTIVE' } }, 42);
      expect(result.status).toBe('COMPLETED');
      expect(usersService.useFreeReview).not.toHaveBeenCalled();
    });
  });
});
