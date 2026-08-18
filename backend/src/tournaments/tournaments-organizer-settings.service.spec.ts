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

// Phase 8b: organizer-configurable tournament settings — registration caps, board
// format/time control, and a custom points system. Real in-memory sqlite, same
// pattern as tournaments-swiss.service.spec.ts.
describe('TournamentsService: organizer-configurable settings (Phase 8b)', () => {
  let service: TournamentsService;
  let usersService: UsersService;

  async function makeUsers(n: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = await usersService.create(`player${i}_${Date.now()}_${Math.random()}`, 'hash');
      ids.push(u.id);
    }
    return ids;
  }

  beforeEach(async () => {
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
      providers: [TournamentsService, UsersService, { provide: NotificationsService, useValue: { notify: async () => ({}) } }],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('createTournament defaults and options', () => {
    it('applies Phase 8 defaults when no options are given at all', async () => {
      const t = await service.createTournament('Defaults', 'Swiss');
      expect(t.maxParticipants).toBeNull();
      expect(t.timeControlName).toBe('blitz');
      expect(t.boardSize).toBe(10);
      expect(t.ruleVariant).toBe('international');
      expect(t.pointsWin).toBe(1);
      expect(t.pointsDraw).toBe(0.5);
      expect(t.pointsLoss).toBe(0);
      expect(t.totalRounds).toBe(3);
    });

    it('still accepts the original bare-number totalRounds argument (Phase 8 backward compatibility)', async () => {
      const t = await service.createTournament('Legacy call', 'Swiss', 5);
      expect(t.totalRounds).toBe(5);
      expect(t.timeControlName).toBe('blitz'); // unaffected, still defaults
    });

    it('applies every organizer-supplied option via the options object', async () => {
      const t = await service.createTournament('Custom Cup', 'Swiss', {
        totalRounds: 4,
        maxParticipants: 16,
        timeControl: 'rapid',
        boardSize: 8,
        variant: 'american',
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
      });
      expect(t.totalRounds).toBe(4);
      expect(t.maxParticipants).toBe(16);
      expect(t.timeControlName).toBe('rapid');
      expect(t.boardSize).toBe(8);
      expect(t.ruleVariant).toBe('american');
      expect(t.pointsWin).toBe(3);
      expect(t.pointsDraw).toBe(1);
      expect(t.pointsLoss).toBe(0);
    });
  });

  describe('registration cap (maxParticipants)', () => {
    it('accepts registrations up to the cap and rejects the one that would exceed it', async () => {
      const t = await service.createTournament('Small Event', 'Swiss', { maxParticipants: 2 });
      await service.openRegistration(t.id);
      const [a, b, c] = await makeUsers(3);

      expect(await service.joinTournament(t.id, a)).not.toBeNull();
      expect(await service.joinTournament(t.id, b)).not.toBeNull();
      await expect(service.joinTournament(t.id, c)).rejects.toThrow(BadRequestException);

      const standings = await service.getStandings(t.id);
      expect(standings).toHaveLength(2);
    });

    it('does not count re-joining an already-registered player against the cap', async () => {
      const t = await service.createTournament('Small Event', 'Swiss', { maxParticipants: 1 });
      await service.openRegistration(t.id);
      const [a] = await makeUsers(1);

      await service.joinTournament(t.id, a);
      await expect(service.joinTournament(t.id, a)).resolves.not.toBeNull(); // idempotent, not a second seat
    });

    it('imposes no cap at all when maxParticipants is left unset', async () => {
      const t = await service.createTournament('Open Event', 'Swiss');
      await service.openRegistration(t.id);
      const ids = await makeUsers(10);
      for (const uid of ids) {
        expect(await service.joinTournament(t.id, uid)).not.toBeNull();
      }
    });
  });

  describe('custom points system', () => {
    it('awards the organizer-configured win/draw/loss points instead of the 1/0.5/0 default', async () => {
      // "Football-style" scoring: 3 for a win, 1 for a draw, 0 for a loss.
      const t = await service.createTournament('Football Rules Swiss', 'Swiss', {
        totalRounds: 1,
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
      });
      await service.openRegistration(t.id);
      const [a, b, c, d] = await makeUsers(4);
      for (const uid of [a, b, c, d]) await service.joinTournament(t.id, uid);
      await service.startTournament(t.id);

      const [p1, p2] = await service.getRoundPairings(t.id, 1);
      await service.recordSwissPairingResult(t.id, p1.player1Id, p1.player2Id!, p1.player1Id); // win/loss
      await service.recordSwissPairingResult(t.id, p2.player1Id, p2.player2Id!, null); // draw

      const standings = await service.getStandings(t.id);
      const winner = standings.find(s => s.user.id === p1.player1Id)!;
      const loser = standings.find(s => s.user.id === p1.player2Id)!;
      const drawer1 = standings.find(s => s.user.id === p2.player1Id)!;
      const drawer2 = standings.find(s => s.user.id === p2.player2Id)!;

      expect(winner.score).toBe(3);
      expect(loser.score).toBe(0);
      expect(drawer1.score).toBe(1);
      expect(drawer2.score).toBe(1);
    });

    it('awards the configured win points for a bye too (byes go through the same scoring path)', async () => {
      const t = await service.createTournament('Odd Field, Custom Points', 'Swiss', {
        totalRounds: 1,
        pointsWin: 3,
      });
      await service.openRegistration(t.id);
      const ids = await makeUsers(3); // odd -> one bye
      for (const uid of ids) await service.joinTournament(t.id, uid);
      await service.startTournament(t.id);

      const pairings = await service.getRoundPairings(t.id, 1);
      const bye = pairings.find(p => p.player2Id === null)!;
      const standings = await service.getStandings(t.id);
      const byeStanding = standings.find(s => s.user.id === bye.player1Id)!;
      expect(byeStanding.score).toBe(3); // configured win value, not a hardcoded 1
    });
  });
});
