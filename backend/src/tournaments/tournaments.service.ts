import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { SwissRound } from './swiss-round.entity';
import { SwissPairingRecord } from './swiss-pairing.entity';
import { UsersService } from '../users/users.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { pairSwissRound, SwissPlayer, BYE } from './swiss-pairing';

// "Or a time limit is hit" (per the brief): a round that's been open this long gets
// force-advanced, scoring any still-unresolved pairing as a draw for both sides —
// generous on purpose, since games can be correspondence-paced, not just blitz.
const ROUND_TIME_LIMIT_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TournamentsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tournament)
    private tournamentRepository: Repository<Tournament>,
    @InjectRepository(TournamentPlayer)
    private tournamentPlayerRepository: Repository<TournamentPlayer>,
    @InjectRepository(SwissRound)
    private roundRepository: Repository<SwissRound>,
    @InjectRepository(SwissPairingRecord)
    private pairingRepository: Repository<SwissPairingRecord>,
    private usersService: UsersService,
  ) {}

  async onModuleInit() {
    // Seed an initial upcoming tournament
    const count = await this.tournamentRepository.count();
    if (count === 0) {
      await this.tournamentRepository.save(this.tournamentRepository.create({
        name: 'Weekly Beginner Arena',
        format: 'Arena',
        status: 'UPCOMING'
      }));
    }
  }

  async getUpcomingTournaments(): Promise<Tournament[]> {
    return this.tournamentRepository.find({
      where: { status: 'UPCOMING' },
      order: { createdAt: 'DESC' },
    });
  }

  async getTournament(id: number): Promise<Tournament | null> {
    return this.tournamentRepository.findOne({
      where: { id },
      relations: ['players', 'players.user'],
    });
  }

  private async requireTournament(id: number): Promise<Tournament> {
    const t = await this.getTournament(id);
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async joinTournament(tournamentId: number, userId: number): Promise<TournamentPlayer | null> {
    const tournament = await this.getTournament(tournamentId);
    // Arena tournaments accept registration while 'UPCOMING'; Swiss tournaments while
    // 'REGISTRATION_OPEN' — see tournament.entity.ts's status comment.
    if (!tournament || !['UPCOMING', 'REGISTRATION_OPEN'].includes(tournament.status)) return null;

    const user = await this.usersService.findOneById(userId);
    if (!user) return null;

    // Check if already joined
    const existing = await this.tournamentPlayerRepository.findOne({
      where: { tournament: { id: tournamentId }, user: { id: userId } }
    });
    if (existing) return existing;

    const player = this.tournamentPlayerRepository.create({ tournament, user, score: 0 });
    return this.tournamentPlayerRepository.save(player);
  }

  async getStandings(tournamentId: number): Promise<TournamentPlayer[]> {
    return this.tournamentPlayerRepository.find({
      where: { tournament: { id: tournamentId } },
      relations: ['user'],
      order: { score: 'DESC' },
    });
  }

  // Standings with a Buchholz tiebreak: the sum of each faced opponent's CURRENT
  // score. Using current (not final) scores keeps this a genuinely "live-updating"
  // tiebreak per the brief, at the cost of it fluctuating as the tournament
  // progresses — the standard trade-off for a live Buchholz display. A bye
  // contributes 0 (the usual convention for a "phantom" opponent).
  async getStandingsWithTiebreak(tournamentId: number): Promise<(TournamentPlayer & { buchholz: number })[]> {
    const standings = await this.getStandings(tournamentId);
    const rounds = await this.roundRepository.find({ where: { tournamentId } });
    const pairings = rounds.length
      ? await this.pairingRepository.find({ where: { roundId: In(rounds.map(r => r.id)) } })
      : [];
    const scoreByUserId = new Map(standings.map(s => [s.user.id, s.score]));

    const withTiebreak = standings.map(s => {
      const uid = s.user.id;
      let buchholz = 0;
      for (const pr of pairings) {
        if (pr.player1Id === uid && pr.player2Id !== null) buchholz += scoreByUserId.get(pr.player2Id) ?? 0;
        else if (pr.player2Id === uid) buchholz += scoreByUserId.get(pr.player1Id) ?? 0;
      }
      return Object.assign(s, { buchholz });
    });

    return withTiebreak.sort((a, b) => b.score - a.score || b.buchholz - a.buchholz);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleTournamentState() {
    // Auto-start tournaments
    const upcoming = await this.tournamentRepository.find({
       where: { status: 'UPCOMING' },
       relations: ['players']
    });

    for (const t of upcoming) {
       const timeDiff = Date.now() - new Date(t.createdAt).getTime();
       if (timeDiff > 60000 && t.players.length >= 2) { // Start after 1 min with 2+ players
          t.status = 'IN_PROGRESS';
          await this.tournamentRepository.save(t);
          console.log(`Tournament ${t.id} started!`);
       }
    }

    // Auto-complete tournaments after 10 minutes
    const inProgress = await this.tournamentRepository.find({
       where: { status: 'IN_PROGRESS' }
    });

    for (const t of inProgress) {
       const timeDiff = Date.now() - new Date(t.createdAt).getTime();
       if (timeDiff > 600000) { // 10 mins
          t.status = 'COMPLETED';
          await this.tournamentRepository.save(t);
          console.log(`Tournament ${t.id} completed!`);
       }
    }

    // Swiss: force-advance any round that's been open past the time limit.
    const openSwissRounds = await this.roundRepository.find({ where: { status: 'IN_PROGRESS' } });
    for (const round of openSwissRounds) {
      const age = Date.now() - new Date(round.startedAt).getTime();
      if (age <= ROUND_TIME_LIMIT_MS) continue;

      const pairings = await this.pairingRepository.find({ where: { roundId: round.id } });
      for (const p of pairings) {
        if (!p.result) {
          p.result = 'DRAW'; // ruling: an unfinished game when the clock runs out is a draw for both
          await this.pairingRepository.save(p);
        }
      }
      await this.checkRoundCompletion(round.tournamentId, round.id);
    }
  }

  async updateTournamentScore(userId: number, tournamentId: number, result: 'WIN' | 'LOSS' | 'DRAW') {
    const player = await this.tournamentPlayerRepository.findOne({
       where: { user: { id: userId }, tournament: { id: tournamentId } }
    });

    if (player) {
       if (result === 'WIN') player.score += 1;
       else if (result === 'DRAW') player.score += 0.5;
       await this.tournamentPlayerRepository.save(player);
    }
  }

  // --- Swiss lifecycle: SCHEDULED -> REGISTRATION_OPEN -> IN_PROGRESS -> COMPLETED ---

  async createTournament(name: string, format: string, totalRounds?: number): Promise<Tournament> {
    const isSwiss = format === 'Swiss';
    const t = this.tournamentRepository.create({
      name,
      format,
      status: isSwiss ? 'SCHEDULED' : 'UPCOMING',
      totalRounds: isSwiss ? (totalRounds ?? 3) : undefined,
    });
    return this.tournamentRepository.save(t);
  }

  async openRegistration(tournamentId: number): Promise<Tournament> {
    const t = await this.requireTournament(tournamentId);
    if (t.format !== 'Swiss') throw new BadRequestException('Only Swiss tournaments use this lifecycle');
    if (t.status !== 'SCHEDULED') throw new BadRequestException(`Cannot open registration from status ${t.status}`);
    t.status = 'REGISTRATION_OPEN';
    return this.tournamentRepository.save(t);
  }

  async startTournament(tournamentId: number): Promise<Tournament> {
    const t = await this.requireTournament(tournamentId);
    if (t.format !== 'Swiss') throw new BadRequestException('Only Swiss tournaments use this lifecycle');
    if (t.status !== 'REGISTRATION_OPEN') throw new BadRequestException(`Cannot start from status ${t.status}`);

    const players = await this.tournamentPlayerRepository.find({ where: { tournament: { id: tournamentId } } });
    if (players.length < 2) throw new BadRequestException('Need at least 2 registered players to start');

    t.status = 'IN_PROGRESS';
    await this.tournamentRepository.save(t);
    await this.generateNextRound(tournamentId);

    return this.requireTournament(tournamentId);
  }

  // --- Swiss round generation & pairing ---

  private async buildSwissPlayers(tournamentId: number): Promise<SwissPlayer[]> {
    const tps = await this.tournamentPlayerRepository.find({
      where: { tournament: { id: tournamentId } },
      relations: ['user'],
    });
    const rounds = await this.roundRepository.find({ where: { tournamentId } });
    const pastPairings = rounds.length
      ? await this.pairingRepository.find({ where: { roundId: In(rounds.map(r => r.id)) } })
      : [];

    return tps.map(tp => {
      const uid = tp.user.id;
      const opponentsFaced: number[] = [];
      let hadBye = false;
      for (const pr of pastPairings) {
        if (pr.player1Id === uid) {
          if (pr.player2Id === null) hadBye = true;
          else opponentsFaced.push(pr.player2Id);
        } else if (pr.player2Id === uid) {
          opponentsFaced.push(pr.player1Id);
        }
      }
      return { id: uid, score: tp.score, opponentsFaced, hadBye };
    });
  }

  async generateNextRound(tournamentId: number): Promise<SwissRound> {
    const t = await this.requireTournament(tournamentId);
    const players = await this.buildSwissPlayers(tournamentId);
    const result = pairSwissRound(players);

    const roundNumber = t.currentRound + 1;
    const round = await this.roundRepository.save(
      this.roundRepository.create({ tournamentId, roundNumber, status: 'IN_PROGRESS' }),
    );

    const rows = result.map(p => this.pairingRepository.create({
      roundId: round.id,
      player1Id: p.player1,
      player2Id: p.player2 === BYE ? null : p.player2,
      result: p.player2 === BYE ? 'BYE' : undefined,
    }));
    await this.pairingRepository.save(rows);

    // The bye is worth a full point immediately — there's no game to wait for.
    for (const row of rows) {
      if (row.result === 'BYE') {
        await this.updateTournamentScore(row.player1Id, tournamentId, 'WIN');
      }
    }

    t.currentRound = roundNumber;
    await this.tournamentRepository.save(t);

    await this.checkRoundCompletion(tournamentId, round.id);

    return round;
  }

  async getRoundPairings(tournamentId: number, roundNumber: number): Promise<SwissPairingRecord[]> {
    const round = await this.roundRepository.findOne({ where: { tournamentId, roundNumber } });
    if (!round) return [];
    return this.pairingRepository.find({ where: { roundId: round.id } });
  }

  // Called alongside updateTournamentScore for any completed tournament game — finds
  // the Swiss pairing these two players were assigned (if this is a Swiss tournament
  // and they were actually paired this round) and records the result there too, then
  // checks whether the round — and possibly the tournament — can now advance.
  async recordSwissPairingResult(
    tournamentId: number,
    player1UserId: number,
    player2UserId: number,
    winnerUserId: number | null, // null = draw
    gameHistoryId?: number,
  ): Promise<void> {
    const t = await this.getTournament(tournamentId);
    if (!t || t.format !== 'Swiss') return;

    const round = await this.roundRepository.findOne({ where: { tournamentId, roundNumber: t.currentRound } });
    if (!round) return;

    const pairing = await this.pairingRepository.findOne({
      where: [
        { roundId: round.id, player1Id: player1UserId, player2Id: player2UserId },
        { roundId: round.id, player1Id: player2UserId, player2Id: player1UserId },
      ],
    });
    if (!pairing || pairing.result) return; // not a prescribed pairing this round, or already recorded

    pairing.result = winnerUserId === null ? 'DRAW' : (winnerUserId === pairing.player1Id ? 'P1_WIN' : 'P2_WIN');
    pairing.gameHistoryId = gameHistoryId ?? null;
    await this.pairingRepository.save(pairing);

    // This is the single entry point for a Swiss game's outcome — it owns applying
    // tournament points too (unlike Arena, which the gateway scores inline), so a
    // caller only has to make one call per completed Swiss game.
    if (winnerUserId === null) {
      await this.updateTournamentScore(player1UserId, tournamentId, 'DRAW');
      await this.updateTournamentScore(player2UserId, tournamentId, 'DRAW');
    } else {
      const loserUserId = winnerUserId === player1UserId ? player2UserId : player1UserId;
      await this.updateTournamentScore(winnerUserId, tournamentId, 'WIN');
      await this.updateTournamentScore(loserUserId, tournamentId, 'LOSS');
    }

    await this.checkRoundCompletion(tournamentId, round.id);
  }

  private async checkRoundCompletion(tournamentId: number, roundId: number): Promise<void> {
    const round = await this.roundRepository.findOneBy({ id: roundId });
    if (!round || round.status === 'COMPLETED') return;

    const pairings = await this.pairingRepository.find({ where: { roundId } });
    const allResolved = pairings.length > 0 && pairings.every(p => !!p.result);
    if (!allResolved) return;

    round.status = 'COMPLETED';
    await this.roundRepository.save(round);

    const t = await this.requireTournament(tournamentId);
    if (t.currentRound >= (t.totalRounds ?? 0)) {
      t.status = 'COMPLETED';
      await this.tournamentRepository.save(t);
    } else {
      await this.generateNextRound(tournamentId);
    }
  }

  // For matchmaking (game.gateway.ts): if this user has a live, unresolved Swiss
  // pairing this round, they must play THAT specific opponent — not whoever else
  // happens to be queuing for the same tournament ID.
  async findSwissOpponent(tournamentId: number, userId: number): Promise<number | null> {
    const t = await this.getTournament(tournamentId);
    if (!t || t.format !== 'Swiss') return null;

    const round = await this.roundRepository.findOne({ where: { tournamentId, roundNumber: t.currentRound } });
    if (!round) return null;

    const pairing = await this.pairingRepository.findOne({
      where: [
        { roundId: round.id, player1Id: userId },
        { roundId: round.id, player2Id: userId },
      ],
    });
    if (!pairing || pairing.result || pairing.player2Id === null) return null;

    return pairing.player1Id === userId ? pairing.player2Id : pairing.player1Id;
  }
}
