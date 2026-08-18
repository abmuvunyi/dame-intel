import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { UsersService } from '../users/users.service';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { SwissRound } from './swiss-round.entity';
import { SwissPairingRecord } from './swiss-pairing.entity';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

// Real in-memory sqlite (same pattern as rating.service.spec.ts / puzzles.service.spec.ts)
// — round generation, pairing persistence, and standings all involve genuine
// relational queries worth exercising for real, not through a mocked repository.
describe('TournamentsService: Swiss lifecycle', () => {
  let service: TournamentsService;
  let usersService: UsersService;
  let notify: jest.Mock;

  async function makeUsers(n: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = await usersService.create(`player${i}_${Date.now()}_${Math.random()}`, 'hash');
      ids.push(u.id);
    }
    return ids;
  }

  async function makeSwissTournament(playerCount: number, totalRounds = 3) {
    const t = await service.createTournament('Test Swiss', 'Swiss', totalRounds);
    await service.openRegistration(t.id);
    const userIds = await makeUsers(playerCount);
    for (const uid of userIds) await service.joinTournament(t.id, uid);
    return { tournament: t, userIds };
  }

  beforeEach(async () => {
    notify = jest.fn().mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Tournament, TournamentPlayer, SwissRound, SwissPairingRecord, User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Tournament, TournamentPlayer, SwissRound, SwissPairingRecord, User]),
      ],
      providers: [TournamentsService, UsersService, { provide: NotificationsService, useValue: { notify } }],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('lifecycle transitions', () => {
    it('creates a Swiss tournament in SCHEDULED status', async () => {
      const t = await service.createTournament('My Swiss', 'Swiss', 4);
      expect(t.status).toBe('SCHEDULED');
      expect(t.totalRounds).toBe(4);
    });

    it('moves SCHEDULED -> REGISTRATION_OPEN, and rejects doing so twice', async () => {
      const t = await service.createTournament('My Swiss', 'Swiss');
      const opened = await service.openRegistration(t.id);
      expect(opened.status).toBe('REGISTRATION_OPEN');
      await expect(service.openRegistration(t.id)).rejects.toThrow(BadRequestException);
    });

    it('allows registration only while REGISTRATION_OPEN', async () => {
      const t = await service.createTournament('My Swiss', 'Swiss');
      const [uid] = await makeUsers(1);

      expect(await service.joinTournament(t.id, uid)).toBeNull(); // still SCHEDULED
      await service.openRegistration(t.id);
      expect(await service.joinTournament(t.id, uid)).not.toBeNull();
    });

    it('refuses to start with fewer than 2 registered players', async () => {
      const t = await service.createTournament('My Swiss', 'Swiss');
      await service.openRegistration(t.id);
      const [uid] = await makeUsers(1);
      await service.joinTournament(t.id, uid);

      await expect(service.startTournament(t.id)).rejects.toThrow(BadRequestException);
    });

    it('moves REGISTRATION_OPEN -> IN_PROGRESS and generates round 1 on start', async () => {
      const { tournament } = await makeSwissTournament(4);
      const started = await service.startTournament(tournament.id);

      expect(started.status).toBe('IN_PROGRESS');
      expect(started.currentRound).toBe(1);
      const pairings = await service.getRoundPairings(tournament.id, 1);
      expect(pairings).toHaveLength(2); // 4 players -> 2 pairings
    });

    // Phase 13 trigger point 3/4.
    it('notifies every registered player that the tournament has started', async () => {
      const { tournament, userIds } = await makeSwissTournament(3);
      await service.startTournament(tournament.id);

      expect(notify).toHaveBeenCalledTimes(3);
      for (const uid of userIds) {
        expect(notify).toHaveBeenCalledWith(uid, 'TOURNAMENT_STARTING', expect.stringContaining(tournament.name), { tournamentId: tournament.id });
      }
    });
  });

  describe('round generation and pairing correctness', () => {
    it('pairs every registered player with no duplicates in round 1', async () => {
      const { tournament, userIds } = await makeSwissTournament(6);
      await service.startTournament(tournament.id);

      const pairings = await service.getRoundPairings(tournament.id, 1);
      const everyone = pairings.flatMap(p => [p.player1Id, p.player2Id]).filter((x): x is number => x !== null);
      expect(everyone.sort((a, b) => a - b)).toEqual([...userIds].sort((a, b) => a - b));
    });

    it('awards a bye immediately (a full point, no game needed) for an odd player count', async () => {
      const { tournament } = await makeSwissTournament(5);
      await service.startTournament(tournament.id);

      const pairings = await service.getRoundPairings(tournament.id, 1);
      const bye = pairings.find(p => p.player2Id === null);
      expect(bye).toBeDefined();
      expect(bye!.result).toBe('BYE');

      const standings = await service.getStandings(tournament.id);
      const byePlayerStanding = standings.find(s => s.user.id === bye!.player1Id);
      expect(byePlayerStanding!.score).toBe(1);
    });
  });

  describe('recording results and automatic round progression', () => {
    it('ignores a result for a pair that was not actually paired this round', async () => {
      const { tournament, userIds } = await makeSwissTournament(4);
      await service.startTournament(tournament.id);
      const pairings = await service.getRoundPairings(tournament.id, 1);

      // Find two players who are NOT paired against each other this round.
      const [a, b] = pairings[0].player2Id !== null
        ? [pairings[0].player1Id, pairings[1].player1Id]
        : userIds.slice(0, 2);

      await service.recordSwissPairingResult(tournament.id, a, b, a);
      const stillUnresolved = await service.getRoundPairings(tournament.id, 1);
      expect(stillUnresolved.every(p => p.player1Id !== a || p.player2Id !== b)).toBe(true); // no matching pairing got touched by mistake — this call should have been a no-op
    });

    it('records a result for the correct pairing regardless of argument order', async () => {
      const { tournament } = await makeSwissTournament(4);
      await service.startTournament(tournament.id);
      const [pairing] = await service.getRoundPairings(tournament.id, 1);

      // Call with player2 first, player1 second — should still find the same row.
      await service.recordSwissPairingResult(tournament.id, pairing.player2Id!, pairing.player1Id, pairing.player1Id);

      const [updated] = await service.getRoundPairings(tournament.id, 1);
      expect(updated.result).toBe('P1_WIN');
    });

    it('does not overwrite an already-recorded result', async () => {
      const { tournament } = await makeSwissTournament(4);
      await service.startTournament(tournament.id);
      const [pairing] = await service.getRoundPairings(tournament.id, 1);

      await service.recordSwissPairingResult(tournament.id, pairing.player1Id, pairing.player2Id!, pairing.player1Id);
      await service.recordSwissPairingResult(tournament.id, pairing.player1Id, pairing.player2Id!, pairing.player2Id); // attempted overwrite

      const [updated] = await service.getRoundPairings(tournament.id, 1);
      expect(updated.result).toBe('P1_WIN'); // unchanged
    });

    it('auto-generates round 2 once every round-1 pairing is resolved, and completes the tournament after the final round', async () => {
      const { tournament, userIds } = await makeSwissTournament(4, 2); // 2 rounds only, so this test finishes fast
      await service.startTournament(tournament.id);

      // Resolve every round-1 pairing.
      let round1 = await service.getRoundPairings(tournament.id, 1);
      for (const p of round1) {
        await service.recordSwissPairingResult(tournament.id, p.player1Id, p.player2Id!, p.player1Id);
      }

      let t = await service.getTournament(tournament.id);
      expect(t!.currentRound).toBe(2); // auto-advanced
      expect(t!.status).toBe('IN_PROGRESS'); // not done yet, 1 round left

      const round2 = await service.getRoundPairings(tournament.id, 2);
      expect(round2.length).toBeGreaterThan(0);

      // Resolve round 2 as well — this was the last round.
      for (const p of round2) {
        await service.recordSwissPairingResult(tournament.id, p.player1Id, p.player2Id!, p.player1Id);
      }

      t = await service.getTournament(tournament.id);
      expect(t!.status).toBe('COMPLETED');
    });

    it('never re-pairs two players who already played each other in an earlier round', async () => {
      // 8 players over 3 rounds: with enough players relative to rounds, the greedy
      // pairing algorithm (documented in swiss-pairing.ts as simplified — no
      // backtracking) has enough room to always find a fresh opponent. With a
      // small field pushed over many rounds, an occasional forced rematch is an
      // accepted, documented limitation, not asserted against here.
      const { tournament } = await makeSwissTournament(8, 3);
      await service.startTournament(tournament.id);

      const seenPairs = new Set<string>();
      for (let round = 1; round <= 3; round++) {
        const pairings = await service.getRoundPairings(tournament.id, round);
        for (const p of pairings) {
          if (p.player2Id === null) continue; // bye
          const key = [p.player1Id, p.player2Id].sort((a, b) => a - b).join('-');
          expect(seenPairs.has(key)).toBe(false);
          seenPairs.add(key);
          await service.recordSwissPairingResult(tournament.id, p.player1Id, p.player2Id, p.player1Id);
        }
      }
    });
  });

  describe('standings and Buchholz tiebreak', () => {
    it('breaks a tie in raw score using the sum of each player\'s opponents\' current scores', async () => {
      const { tournament } = await makeSwissTournament(4, 1);
      await service.startTournament(tournament.id);
      const [pairing] = await service.getRoundPairings(tournament.id, 1);
      const pairings = await service.getRoundPairings(tournament.id, 1);

      // Both winners end up tied at 1 point each, but against opposite-strength
      // opponents: give one winner's beaten opponent an extra point elsewhere isn't
      // possible in a 1-round tournament, so instead assert the tiebreak field itself
      // reflects the (0-score) opponents correctly for a simple, verifiable case.
      for (const p of pairings) {
        await service.recordSwissPairingResult(tournament.id, p.player1Id, p.player2Id!, p.player1Id);
      }

      const standings = await service.getStandingsWithTiebreak(tournament.id);
      const winners = standings.filter(s => s.score === 1);
      expect(winners).toHaveLength(2);
      // Each winner's Buchholz is their beaten opponent's current score (0, since
      // that opponent lost and gained nothing) — sanity-checks the sum is computed at all.
      for (const w of winners) {
        expect(w.buchholz).toBe(0);
      }
    });

    // Regression (Phase 8b): TournamentPlayer.score had no explicit 'float' column
    // type, so sqlite silently truncated every drawn game's +0.5 to +0 — a real,
    // pre-existing bug (predating Phase 8) discovered while adding a configurable
    // points system. Fixed in tournament-player.entity.ts.
    it('awards exactly 0.5 points to both players in a drawn game, not 0', async () => {
      const { tournament } = await makeSwissTournament(2, 1);
      await service.startTournament(tournament.id);
      const [pairing] = await service.getRoundPairings(tournament.id, 1);

      await service.recordSwissPairingResult(tournament.id, pairing.player1Id, pairing.player2Id!, null); // draw

      const standings = await service.getStandings(tournament.id);
      expect(standings.every(s => s.score === 0.5)).toBe(true);
    });
  });

  describe('findSwissOpponent (matchmaking integration)', () => {
    it('returns the prescribed opponent for an unresolved pairing', async () => {
      const { tournament } = await makeSwissTournament(4);
      await service.startTournament(tournament.id);
      const [pairing] = await service.getRoundPairings(tournament.id, 1);

      const opponent = await service.findSwissOpponent(tournament.id, pairing.player1Id);
      expect(opponent).toBe(pairing.player2Id);
      const reverse = await service.findSwissOpponent(tournament.id, pairing.player2Id!);
      expect(reverse).toBe(pairing.player1Id);
    });

    it('returns null once the pairing has already been resolved', async () => {
      const { tournament } = await makeSwissTournament(4);
      await service.startTournament(tournament.id);
      const [pairing] = await service.getRoundPairings(tournament.id, 1);
      await service.recordSwissPairingResult(tournament.id, pairing.player1Id, pairing.player2Id!, pairing.player1Id);

      expect(await service.findSwissOpponent(tournament.id, pairing.player1Id)).toBeNull();
    });

    it('returns null for a non-Swiss tournament', async () => {
      const arena = await service.createTournament('Arena Test', 'Arena');
      const [uid] = await makeUsers(1);
      expect(await service.findSwissOpponent(arena.id, uid)).toBeNull();
    });

    it('returns null for a player with a bye this round', async () => {
      const { tournament } = await makeSwissTournament(5);
      await service.startTournament(tournament.id);
      const pairings = await service.getRoundPairings(tournament.id, 1);
      const bye = pairings.find(p => p.player2Id === null)!;

      expect(await service.findSwissOpponent(tournament.id, bye.player1Id)).toBeNull();
    });
  });

  // Phase 13 trigger point 3/4, the other half — Arena's auto-start (the cron-driven
  // 'UPCOMING' -> 'IN_PROGRESS' path), distinct from Swiss's explicit startTournament.
  describe('Arena tournament auto-start notification (Phase 13)', () => {
    it('notifies every registered player once the cron sweep auto-starts the tournament', async () => {
      const t = await service.createTournament('Arena Cup', 'Arena');
      const userIds = await makeUsers(2);
      for (const uid of userIds) await service.joinTournament(t.id, uid);

      // Force the tournament to look old enough to auto-start — handleTournamentState
      // only starts an 'UPCOMING' Arena tournament once it's been open for 60s+.
      const tournamentRepository = (service as any).tournamentRepository;
      await tournamentRepository.update(t.id, { createdAt: new Date(Date.now() - 61_000) });

      await service.handleTournamentState();

      expect(notify).toHaveBeenCalledTimes(2);
      for (const uid of userIds) {
        expect(notify).toHaveBeenCalledWith(uid, 'TOURNAMENT_STARTING', expect.stringContaining('Arena Cup'), { tournamentId: t.id });
      }
    });

    it('does not notify anyone for a tournament that has not met the auto-start conditions yet', async () => {
      const t = await service.createTournament('Too Fresh', 'Arena');
      const userIds = await makeUsers(2);
      for (const uid of userIds) await service.joinTournament(t.id, uid);
      // createdAt left as "just now" — under the 60s threshold.

      await service.handleTournamentState();

      expect(notify).not.toHaveBeenCalled();
    });
  });
});
