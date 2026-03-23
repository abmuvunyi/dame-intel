import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameHistory } from './history.entity';
import { User } from '../users/user.entity';

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(GameHistory)
    private historyRepository: Repository<GameHistory>,
  ) {}

  async saveGame(
    lightPlayer: User | null,
    darkPlayer: User | null,
    winner: 'L' | 'D' | 'DRAW',
    moves: any[],
    variant: string = 'STANDARD'
  ): Promise<GameHistory> {
    const game = this.historyRepository.create({
      lightPlayer: lightPlayer || undefined,
      darkPlayer: darkPlayer || undefined,
      winner: winner === 'L' ? 'LIGHT' : (winner === 'D' ? 'DARK' : 'DRAW'),
      variant,
      moves: moves // simple-json handles stringification
    });
    return this.historyRepository.save(game);
  }

  async getPlayerHistory(userId: number): Promise<GameHistory[]> {
    return this.historyRepository.find({
      where: [
        { lightPlayer: { id: userId } },
        { darkPlayer: { id: userId } }
      ],
      relations: ['lightPlayer', 'darkPlayer'],
      order: { playedAt: 'DESC' },
      take: 20
    });
  }

  async getGame(id: number): Promise<GameHistory | null> {
    return this.historyRepository.findOne({
      where: { id },
      relations: ['lightPlayer', 'darkPlayer']
    });
  }
}
