import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { UsersService } from '../users/users.service';

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
}
