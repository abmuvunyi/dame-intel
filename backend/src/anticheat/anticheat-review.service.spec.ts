import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnticheatService } from './anticheat.service';
import { CheatFlag } from './cheat-flag.entity';
import { AiService } from '../game/ai/ai/ai.service';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { GameHistory } from '../history/history.entity';
import { User } from '../users/user.entity';
import { DraughtsEngine } from '../game/engine/engine.service';
import { MIN_SAMPLE_SIZE as MIN_TIMING_SAMPLES } from './move-timing-stats';

// Real in-memory sqlite (User, CheatFlag, GameHistory), real UsersService and
// HistoryService — only AiService is a controllable spy, since its own real
// minimax search is already exhaustively tested elsewhere (Phase 3/11) and isn't
// what this suite is verifying. This is the actual "moderator review queue" +
// "detection only ever creates flags, never bans" behavior end-to-end.
describe('AnticheatService: engine-correlation + timing detection (Phase 12)', () => {
  let service: AnticheatService;
  let usersService: UsersService;
  let historyService: HistoryService;
  let aiServiceMock: { analyzePosition: jest.Mock };

  async function setup() {
    aiServiceMock = { analyzePosition: jest.fn().mockReturnValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User, CheatFlag, GameHistory],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([CheatFlag, GameHistory, User]),
      ],
      providers: [
        AnticheatService,
        UsersService,
        HistoryService,
        { provide: AiService, useValue: aiServiceMock },
      ],
    }).compile();

    service = module.get<AnticheatService>(AnticheatService);
    usersService = module.get<UsersService>(UsersService);
    historyService = module.get<HistoryService>(HistoryService);
  }

  beforeEach(setup);

  function makeEvalEntry(move: any, evaluation: number) {
    return { move: { from: move.from, to: move.to }, evaluation };
  }
  const OTHER_MOVE = { from: { row: 9, col: 9 }, to: { row: 9, col: 9 } };

  // Generates a genuinely legal move sequence (not hand-authored) so the internal
  // replay (engine.makeMove per move) always succeeds — same technique used
  // elsewhere in this codebase.
  function generateLegalMoves(count: number, rules: any) {
    const engine = new DraughtsEngine(rules);
    const moves: any[] = [];
    for (let i = 0; i < count; i++) {
      const legal = engine.getLegalMoves();
      if (legal.length === 0) break;
      const move = legal[0];
      engine.makeMove(move);
      moves.push(move);
    }
    return moves;
  }

  describe('engine-correlation, restricted to critical positions', () => {
    it('flags a player who matches the engine\'s top choice in >=90% of >=10 critical positions', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const rules = { boardSize: 8, variant: 'american' as const };
      const moves = generateLegalMoves(24, rules);
      expect(moves.length).toBe(24);

      // Every position is "critical" (2 evaluated options, spread of 10 > the
      // criticality threshold). Light (alice) matches every single one; Dark (bob)
      // matches only about half — nowhere near the 90% threshold.
      const evalQueue = moves.map((move, i) => {
        const isLight = i % 2 === 0;
        const matched = isLight ? true : (i % 4 === 1);
        const best = matched ? makeEvalEntry(move, 10) : makeEvalEntry(OTHER_MOVE, 10);
        const worst = makeEvalEntry(move, 0);
        return [best, worst];
      });
      let callIndex = 0;
      aiServiceMock.analyzePosition.mockImplementation(() => evalQueue[callIndex++]);

      await service.analyzeGameForCheating(alice, bob, moves, rules, undefined, 1);

      const aliceFlags = await service.getFlagsForUser(alice.id);
      expect(aliceFlags).toHaveLength(1);
      expect(aliceFlags[0].flagType).toBe('ENGINE_CORRELATION');
      expect(aliceFlags[0].score).toBe(1); // 12/12
      expect(aliceFlags[0].sampleSize).toBe(12);
      expect(aliceFlags[0].gameId).toBe(1);

      const bobFlags = await service.getFlagsForUser(bob.id);
      expect(bobFlags).toHaveLength(0);
    });

    it('does NOT flag a player who matches every move, if none of those positions were actually critical', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const rules = { boardSize: 8, variant: 'american' as const };
      const moves = generateLegalMoves(20, rules);

      // Perfect match every time, but spread is only 2 (below the >3 criticality
      // threshold) — every position looks "obvious/forced", so none of them should
      // count as evidence of anything, no matter how consistently they're matched.
      const evalQueue = moves.map(move => [makeEvalEntry(move, 2), makeEvalEntry(move, 0)]);
      let callIndex = 0;
      aiServiceMock.analyzePosition.mockImplementation(() => evalQueue[callIndex++]);

      await service.analyzeGameForCheating(alice, bob, moves, rules, undefined, 2);

      expect(await service.getFlagsForUser(alice.id)).toHaveLength(0);
      expect(await service.getFlagsForUser(bob.id)).toHaveLength(0);
    });

    it('does NOT flag when there are fewer than MIN_CRITICAL_POSITIONS critical positions, even at 100% match', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const rules = { boardSize: 8, variant: 'american' as const };
      const moves = generateLegalMoves(12, rules); // only 6 Light-turn positions

      const evalQueue = moves.map(move => [makeEvalEntry(move, 10), makeEvalEntry(move, 0)]);
      let callIndex = 0;
      aiServiceMock.analyzePosition.mockImplementation(() => evalQueue[callIndex++]);

      await service.analyzeGameForCheating(alice, bob, moves, rules, undefined, 3);

      expect(await service.getFlagsForUser(alice.id)).toHaveLength(0); // only 6 critical positions, below the floor
    });

    it('never touches User.moderationStatus, no matter how many flags are created', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const rules = { boardSize: 8, variant: 'american' as const };
      const moves = generateLegalMoves(24, rules);
      const evalQueue = moves.map(move => [makeEvalEntry(move, 10), makeEvalEntry(move, 0)]); // both sides match everything
      let callIndex = 0;
      aiServiceMock.analyzePosition.mockImplementation(() => evalQueue[callIndex++]);

      await service.analyzeGameForCheating(alice, bob, moves, rules, undefined, 4);

      expect((await service.getFlagsForUser(alice.id)).length).toBeGreaterThan(0);
      expect((await service.getFlagsForUser(bob.id)).length).toBeGreaterThan(0);

      const freshAlice = await usersService.findOneById(alice.id);
      const freshBob = await usersService.findOneById(bob.id);
      expect(freshAlice!.moderationStatus).toBe('NONE');
      expect(freshBob!.moderationStatus).toBe('NONE');
    });
  });

  describe('move-timing anomaly detection, aggregated across games', () => {
    it('flags a player whose think-time is unnaturally consistent across several games combined', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const placeholderMoves = Array(20).fill({ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } });

      // Game 1: alice = Light (even indices), consistently ~1000ms; bob = Dark, wildly variable.
      const timings1 = placeholderMoves.map((_, i) => (i % 2 === 0 ? 1000 : 500 + i * 900));
      await historyService.saveGame(alice as any, bob as any, 'DRAW', placeholderMoves, {}, timings1);

      // Game 2: alice = Dark (odd indices) this time, still consistently ~1000ms.
      const timings2 = placeholderMoves.map((_, i) => (i % 2 === 1 ? 1000 : 300 + i * 700));
      await historyService.saveGame(bob as any, alice as any, 'DRAW', placeholderMoves, {}, timings2);

      // The just-completed "current" game being analyzed right now: alice = Light again.
      const currentTimings = placeholderMoves.map((_, i) => (i % 2 === 0 ? 1000 : 200 + i * 800));

      await service.analyzeGameForCheating(alice, bob, placeholderMoves, {}, currentTimings, 5);

      const aliceFlags = await service.getFlagsForUser(alice.id);
      const timingFlag = aliceFlags.find(f => f.flagType === 'MOVE_TIMING');
      expect(timingFlag).toBeDefined();
      expect(timingFlag!.sampleSize).toBeGreaterThanOrEqual(MIN_TIMING_SAMPLES);
      expect(timingFlag!.score).toBeLessThan(0.15); // the CV itself

      const bobFlags = await service.getFlagsForUser(bob.id);
      expect(bobFlags.find(f => f.flagType === 'MOVE_TIMING')).toBeUndefined(); // bob's timings were highly variable
    });

    it('does not flag when the combined sample across games is still below MIN_SAMPLE_SIZE', async () => {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const shortGame = Array(6).fill({ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }); // only 3 alice moves

      const timings = shortGame.map((_, i) => (i % 2 === 0 ? 1000 : 5000));
      await service.analyzeGameForCheating(alice, bob, shortGame.concat(Array(4).fill(shortGame[0])), {}, timings, 6);
      // (padded to clear the moves.length < 10 game-level guard in analyzeGameForCheating)

      const timingFlag = (await service.getFlagsForUser(alice.id)).find(f => f.flagType === 'MOVE_TIMING');
      expect(timingFlag).toBeUndefined();
    });
  });

  describe('moderator review queue', () => {
    async function createOneFlag(): Promise<{ alice: User, flagId: number }> {
      const alice = await usersService.create('alice', 'hash');
      const bob = await usersService.create('bob', 'hash');
      const rules = { boardSize: 8, variant: 'american' as const };
      const moves = generateLegalMoves(24, rules);
      const evalQueue = moves.map((move, i) => {
        const isLight = i % 2 === 0;
        return isLight ? [makeEvalEntry(move, 10), makeEvalEntry(move, 0)] : [makeEvalEntry(OTHER_MOVE, 10), makeEvalEntry(move, 0)];
      });
      let callIndex = 0;
      aiServiceMock.analyzePosition.mockImplementation(() => evalQueue[callIndex++]);
      await service.analyzeGameForCheating(alice, bob, moves, rules, undefined, 10);
      const [flag] = await service.getFlagsForUser(alice.id);
      return { alice, flagId: flag.id };
    }

    it('getFlags() lists unreviewed flags by default filter, and can filter either way', async () => {
      const { flagId } = await createOneFlag();
      expect((await service.getFlags(false)).some(f => f.id === flagId)).toBe(true);
      expect((await service.getFlags(true)).some(f => f.id === flagId)).toBe(false);
      expect((await service.getFlags()).some(f => f.id === flagId)).toBe(true); // no filter = all
    });

    it('applyModeratorAction(DISMISS) marks the flag reviewed without changing the user\'s standing', async () => {
      const { alice, flagId } = await createOneFlag();
      const moderator = await usersService.create('mod', 'hash');

      const reviewed = await service.applyModeratorAction(flagId, moderator.id, 'DISMISS', 'false positive, strong human play');
      expect(reviewed.reviewed).toBe(true);
      expect(reviewed.moderatorAction).toBe('DISMISS');
      expect(reviewed.reviewedByUserId).toBe(moderator.id);

      const freshAlice = await usersService.findOneById(alice.id);
      expect(freshAlice!.moderationStatus).toBe('NONE');
    });

    it('applyModeratorAction(WARN) sets the user\'s moderationStatus to WARNED', async () => {
      const { alice, flagId } = await createOneFlag();
      const moderator = await usersService.create('mod', 'hash');

      await service.applyModeratorAction(flagId, moderator.id, 'WARN', 'first offense');
      const freshAlice = await usersService.findOneById(alice.id);
      expect(freshAlice!.moderationStatus).toBe('WARNED');
      expect(freshAlice!.moderationNote).toBe('first offense');
    });

    it('applyModeratorAction(TEMP_BAN) requires tempBanDays and sets a real future tempBanUntil', async () => {
      const { alice, flagId } = await createOneFlag();
      const moderator = await usersService.create('mod', 'hash');

      // Validation happens before the flag is marked reviewed, so the same flag can
      // still be used for the real action right after this rejected attempt.
      await expect(service.applyModeratorAction(flagId, moderator.id, 'TEMP_BAN')).rejects.toThrow(BadRequestException);

      await service.applyModeratorAction(flagId, moderator.id, 'TEMP_BAN', 'timing anomaly', 7);
      const freshAlice = await usersService.findOneById(alice.id);
      expect(freshAlice!.moderationStatus).toBe('TEMP_BANNED');
      expect(freshAlice!.tempBanUntil).not.toBeNull();
      expect(new Date(freshAlice!.tempBanUntil!).getTime()).toBeGreaterThan(Date.now());
      expect(usersService.isCurrentlyBanned(freshAlice!)).toBe(true);
    });

    it('applyModeratorAction(PERMA_BAN) permanently bans the user', async () => {
      const { alice, flagId } = await createOneFlag();
      const moderator = await usersService.create('mod', 'hash');

      await service.applyModeratorAction(flagId, moderator.id, 'PERMA_BAN', 'confirmed engine assistance');
      const freshAlice = await usersService.findOneById(alice.id);
      expect(freshAlice!.moderationStatus).toBe('PERMA_BANNED');
      expect(usersService.isCurrentlyBanned(freshAlice!)).toBe(true);
    });

    it('refuses to review the same flag twice', async () => {
      const { flagId } = await createOneFlag();
      const moderator = await usersService.create('mod', 'hash');

      await service.applyModeratorAction(flagId, moderator.id, 'WARN');
      await expect(service.applyModeratorAction(flagId, moderator.id, 'DISMISS')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a nonexistent flag id', async () => {
      const moderator = await usersService.create('mod', 'hash');
      await expect(service.applyModeratorAction(999999, moderator.id, 'DISMISS')).rejects.toThrow(NotFoundException);
    });

    it('getFlag and getFlagsForUser return the flag with its user relation populated', async () => {
      const { alice, flagId } = await createOneFlag();
      const flag = await service.getFlag(flagId);
      expect(flag!.user.id).toBe(alice.id);
      expect(flag!.user.username).toBe('alice');
    });
  });
});
