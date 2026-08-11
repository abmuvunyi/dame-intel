import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { Puzzle } from './puzzle.entity';
import { GameHistory } from '../history/history.entity';
import { User } from '../users/user.entity';
import { PieceColor, Move } from '../game/engine/engine.service';

describe('PuzzleGeneratorService', () => {
  let service: PuzzleGeneratorService;
  let historyRepo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        // User must be registered too: GameHistory has @ManyToOne relations to it.
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [Puzzle, GameHistory, User], synchronize: true }),
        TypeOrmModule.forFeature([Puzzle, GameHistory]),
      ],
      providers: [PuzzleGeneratorService],
    }).compile();

    service = module.get<PuzzleGeneratorService>(PuzzleGeneratorService);
    historyRepo = (service as any).historyRepository;
  });

  it('flags a position where a 2+-piece capture was available but a different (shorter) capture was played', async () => {
    // A real, engine-verified 18-move opening from the true starting position (found
    // by search, not hand-derived) that reaches a position where American rules'
    // no-majority-required mandatory capture (Phase 2) offers a genuine choice: a
    // 2-piece capture, or a 1-piece one. Playing the 1-piece capture here is a
    // completely legal move under American rules — and exactly the kind of "didn't
    // take the best line" position this generator exists to surface.
    const openingMoves: Move[] = [
      { from: { row: 5, col: 2 }, to: { row: 4, col: 3 } },
      { from: { row: 2, col: 3 }, to: { row: 3, col: 4 } },
      { from: { row: 4, col: 3 }, to: { row: 3, col: 2 } },
      { from: { row: 2, col: 1 }, to: { row: 4, col: 3 }, captured: [{ row: 3, col: 2 }] },
      { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] },
      { from: { row: 1, col: 4 }, to: { row: 2, col: 3 } },
      { from: { row: 3, col: 2 }, to: { row: 1, col: 4 }, captured: [{ row: 2, col: 3 }] },
      { from: { row: 0, col: 5 }, to: { row: 2, col: 3 }, captured: [{ row: 1, col: 4 }] },
      { from: { row: 6, col: 3 }, to: { row: 5, col: 2 } },
      { from: { row: 1, col: 2 }, to: { row: 2, col: 1 } },
      { from: { row: 7, col: 4 }, to: { row: 6, col: 3 } },
      { from: { row: 2, col: 5 }, to: { row: 3, col: 6 } },
      { from: { row: 6, col: 3 }, to: { row: 5, col: 4 } },
      { from: { row: 3, col: 6 }, to: { row: 4, col: 5 } },
      { from: { row: 5, col: 4 }, to: { row: 3, col: 6 }, captured: [{ row: 4, col: 5 }] },
      { from: { row: 2, col: 7 }, to: { row: 4, col: 5 }, captured: [{ row: 3, col: 6 }] },
      { from: { row: 5, col: 2 }, to: { row: 4, col: 3 } },
      { from: { row: 3, col: 4 }, to: { row: 5, col: 2 }, captured: [{ row: 4, col: 3 }] },
    ];
    const missedChain: Move = { from: { row: 5, col: 6 }, to: { row: 1, col: 2 }, captured: [{ row: 4, col: 5 }, { row: 2, col: 3 }] };
    const playedInstead: Move = { from: { row: 6, col: 1 }, to: { row: 4, col: 3 }, captured: [{ row: 5, col: 2 }] };

    const game = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [...openingMoves, playedInstead],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await service.scanGame(game.id);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].status).toBe('pending');
    expect(candidates[0].sourceGameId).toBe(game.id);
    expect(candidates[0].solution).toEqual([missedChain]);
    expect(candidates[0].turnToMove).toBe(PieceColor.LIGHT);
    expect(candidates[0].difficulty).toBe(2); // 2-piece capture -> medium
  });

  it('does not flag a position where the best available capture was the move actually played', async () => {
    const openingMoves: Move[] = [
      { from: { row: 5, col: 2 }, to: { row: 4, col: 3 } },
      { from: { row: 2, col: 3 }, to: { row: 3, col: 4 } },
      { from: { row: 4, col: 3 }, to: { row: 3, col: 2 } },
      { from: { row: 2, col: 1 }, to: { row: 4, col: 3 }, captured: [{ row: 3, col: 2 }] },
      { from: { row: 5, col: 4 }, to: { row: 3, col: 2 }, captured: [{ row: 4, col: 3 }] },
      { from: { row: 1, col: 4 }, to: { row: 2, col: 3 } },
      { from: { row: 3, col: 2 }, to: { row: 1, col: 4 }, captured: [{ row: 2, col: 3 }] },
      { from: { row: 0, col: 5 }, to: { row: 2, col: 3 }, captured: [{ row: 1, col: 4 }] },
      { from: { row: 6, col: 3 }, to: { row: 5, col: 2 } },
      { from: { row: 1, col: 2 }, to: { row: 2, col: 1 } },
      { from: { row: 7, col: 4 }, to: { row: 6, col: 3 } },
      { from: { row: 2, col: 5 }, to: { row: 3, col: 6 } },
      { from: { row: 6, col: 3 }, to: { row: 5, col: 4 } },
      { from: { row: 3, col: 6 }, to: { row: 4, col: 5 } },
      { from: { row: 5, col: 4 }, to: { row: 3, col: 6 }, captured: [{ row: 4, col: 5 }] },
      { from: { row: 2, col: 7 }, to: { row: 4, col: 5 }, captured: [{ row: 3, col: 6 }] },
      { from: { row: 5, col: 2 }, to: { row: 4, col: 3 } },
      { from: { row: 3, col: 4 }, to: { row: 5, col: 2 }, captured: [{ row: 4, col: 3 }] },
    ];
    // Same position as the "missed" test above, but this time the 2-piece capture is
    // exactly what gets played.
    const bestCapture: Move = { from: { row: 5, col: 6 }, to: { row: 1, col: 2 }, captured: [{ row: 4, col: 5 }, { row: 2, col: 3 }] };

    const game = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [...openingMoves, bestCapture],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await service.scanGame(game.id);
    expect(candidates).toHaveLength(0);
  });

  it('does not flag ordinary positions with no multi-piece capture available at all', async () => {
    const quietMove: Move = { from: { row: 5, col: 4 }, to: { row: 4, col: 5 } }; // real legal opening move

    const game = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [quietMove],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const candidates = await service.scanGame(game.id);
    expect(candidates).toHaveLength(0);
  });

  it('scanRecentGames scans multiple games and reports candidate counts per game', async () => {
    const g1 = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [{ from: { row: 5, col: 4 }, to: { row: 4, col: 5 } }],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));
    const g2 = await historyRepo.save(historyRepo.create({
      winner: 'DRAW',
      moves: [{ from: { row: 5, col: 2 }, to: { row: 4, col: 3 } }],
      rules: { boardSize: 8, variant: 'american', forceMajorityCapture: false },
    }));

    const results = await service.scanRecentGames(10);
    expect(results.map(r => r.gameId).sort()).toEqual([g1.id, g2.id].sort());
  });
});
