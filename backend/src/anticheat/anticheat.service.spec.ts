import { Test, TestingModule } from '@nestjs/testing';
import { AnticheatService } from './anticheat.service';
import { AiService } from '../game/ai/ai/ai.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CheatFlag } from './cheat-flag.entity';
import { DraughtsEngine } from '../game/engine/engine.service';

describe('AnticheatService', () => {
  let service: AnticheatService;
  let analyzedBoards: string[];

  beforeEach(async () => {
    analyzedBoards = [];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnticheatService,
        {
          provide: AiService,
          // A spy, not a real minimax search (would be slow and beside the point here)
          // — records the exact board `analyzeGameForCheating` handed it at each step,
          // so the test can tell a real move-by-move replay apart from one frozen at
          // the starting position.
          useValue: {
            analyzePosition: (engine: DraughtsEngine) => {
              analyzedBoards.push(JSON.stringify(engine.getBoard()));
              const legal = engine.getLegalMoves();
              return legal.map(move => ({ move, evaluation: 0 }));
            },
          },
        },
        { provide: getRepositoryToken(CheatFlag), useValue: { create: (x: any) => x, save: async (x: any) => x } },
      ],
    }).compile();

    service = module.get<AnticheatService>(AnticheatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Regression: found while building Phase 11's post-game review. `new
  // DraughtsEngine()` with no rules silently defaulted to 8x8 — for a 10x10 game,
  // confirmed directly (see the STATUS.md writeup) that this makes the VERY FIRST
  // recorded move fail to apply, freezing the "replay" at the initial position for
  // the entire rest of the game.
  it('replays a real 10x10 game correctly when rules are passed, not just at the wrong 8x8 default', async () => {
    // Generate a genuine, fully legal 10x10 move sequence (not hand-authored) by
    // always taking the engine's own first legal move — same technique used
    // elsewhere in this codebase to avoid asserting against a fabricated position.
    const realEngine = new DraughtsEngine({ boardSize: 10, variant: 'international' });
    const moves: any[] = [];
    for (let i = 0; i < 12; i++) {
      const legal = realEngine.getLegalMoves();
      if (legal.length === 0) break;
      const move = legal[0];
      realEngine.makeMove(move);
      moves.push(move);
    }
    expect(moves.length).toBeGreaterThanOrEqual(10); // must clear the `moves.length < 10` guard

    const alice = { id: 1, username: 'alice' } as any;
    const bob = { id: 2, username: 'bob' } as any;

    await service.analyzeGameForCheating(alice, bob, moves, { boardSize: 10, variant: 'international' });
    const distinctBoardsWithRules = new Set(analyzedBoards).size;

    analyzedBoards = [];
    await service.analyzeGameForCheating(alice, bob, moves); // old call shape — no rules
    const distinctBoardsWithoutRules = new Set(analyzedBoards).size;

    // Correct replay: every move produces a genuinely new position (captures,
    // advances, etc.), so distinct boards == number of moves analyzed.
    expect(distinctBoardsWithRules).toBe(moves.length);
    // Buggy replay: the wrong-sized engine mostly can't apply the real game's moves
    // at all (they don't exist on its board), so it sits frozen for long stretches —
    // occasionally a move coincidentally happens to also be legal against the wrong
    // engine's own unrelated starting layout and nudges it to a second stuck state,
    // but it never comes close to tracking the real game's actual progression.
    expect(distinctBoardsWithoutRules).toBeLessThan(distinctBoardsWithRules);
    expect(distinctBoardsWithoutRules).toBeLessThanOrEqual(3);
  });
});
