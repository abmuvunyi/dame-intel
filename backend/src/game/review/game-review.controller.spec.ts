import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { GameReviewController } from './game-review.controller';
import { GameReviewService } from './game-review.service';
import { UsersService } from '../../users/users.service';
import { accessFor } from '../../billing/access';

describe('GameReviewController', () => {
  let controller: GameReviewController;
  let gameReviewService: { getReview: jest.Mock };
  let usersService: { accessFor: jest.Mock };

  beforeEach(async () => {
    gameReviewService = { getReview: jest.fn() };
    // Real plan/entitlement resolution (billing/access.ts), not a stand-in — same
    // pattern analysis.controller.spec.ts already uses for this exact reason.
    usersService = { accessFor: jest.fn((user: any) => accessFor(user)) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameReviewController],
      providers: [
        { provide: GameReviewService, useValue: gameReviewService },
        { provide: UsersService, useValue: usersService },
        // OptionalAuthGuard (@UseGuards on the controller) is resolved as a real
        // provider at module-compile time even though these tests call the
        // controller method directly rather than going through it — it still needs
        // a JwtService in the DI graph to construct.
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<GameReviewController>(GameReviewController);
  });

  it('reports LOCKED (not the actual review data) for an anonymous viewer, and never even queries the review row', async () => {
    const result = await controller.getReview({ authUser: null }, 42);
    expect(result).toEqual({ gameId: 42, status: 'LOCKED', requiresPlan: 'PLUS' });
    expect(gameReviewService.getReview).not.toHaveBeenCalled();
  });

  it('reports LOCKED for a logged-in FREE user too', async () => {
    const result = await controller.getReview({ authUser: { membershipTier: 'FREE' } }, 42);
    expect(result).toEqual({ gameId: 42, status: 'LOCKED', requiresPlan: 'PLUS' });
  });

  it('returns the real review, with lines included, for a PLUS subscriber', async () => {
    gameReviewService.getReview.mockResolvedValue({
      gameId: 42, status: 'COMPLETED', moveReviews: [{ moveIndex: 0, recommendedLine: [{ from: { row: 1, col: 1 }, to: { row: 2, col: 2 } }] }],
    });
    const result = await controller.getReview({ authUser: { membershipTier: 'PLUS', membershipStatus: 'ACTIVE' } }, 42);
    expect(result.status).toBe('COMPLETED');
    expect(result.linesIncluded).toBe(true);
    expect(result.moveReviews[0].recommendedLine).not.toBeNull();
  });

  it('returns the real review for a PREMIUM subscriber too', async () => {
    gameReviewService.getReview.mockResolvedValue({ gameId: 43, status: 'COMPLETED', moveReviews: [] });
    const result = await controller.getReview({ authUser: { membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE' } }, 43);
    expect(result.status).toBe('COMPLETED');
    expect(result.linesIncluded).toBe(true);
  });

  it('reports NOT_STARTED (not LOCKED) for an entitled viewer whose review just has not been queued/completed yet', async () => {
    gameReviewService.getReview.mockResolvedValue(null);
    const result = await controller.getReview({ authUser: { membershipTier: 'PLUS', membershipStatus: 'ACTIVE' } }, 44);
    expect(result).toEqual({ gameId: 44, status: 'NOT_STARTED' });
  });

  it('reports LOCKED for a PAST_DUE-lapsed subscriber (access.ts treats PAST_DUE as still active, so this actually stays unlocked — sanity check the boundary the other way with a canceled one)', async () => {
    const result = await controller.getReview({ authUser: { membershipTier: 'PLUS', membershipStatus: 'CANCELED' } }, 45);
    expect(result).toEqual({ gameId: 45, status: 'LOCKED', requiresPlan: 'PLUS' });
  });
});