import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { UsersService } from '../users/users.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TournamentsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tournament)
    private tournamentRepository: Repository<Tournament>,
    @InjectRepository(TournamentPlayer)
    private tournamentPlayerRepository: Repository<TournamentPlayer>,
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

  async joinTournament(tournamentId: number, userId: number): Promise<TournamentPlayer | null> {
    const tournament = await this.getTournament(tournamentId);
    if (!tournament || tournament.status !== 'UPCOMING') return null;

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
}
