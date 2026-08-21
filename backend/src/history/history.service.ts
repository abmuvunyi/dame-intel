import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameHistory } from './history.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(GameHistory)
    private historyRepository: Repository<GameHistory>,
    private usersService: UsersService,
  ) {}

  async saveGame(
    lightPlayer: User | null,
    darkPlayer: User | null,
    winner: 'L' | 'D' | 'DRAW',
    moves: any[],
    rules?: any,
    moveTimings?: number[], // Phase 12 — see GameHistory.moveTimings
  ): Promise<GameHistory> {
    const game = this.historyRepository.create({
      lightPlayer: lightPlayer || undefined,
      darkPlayer: darkPlayer || undefined,
      winner: winner === 'L' ? 'LIGHT' : (winner === 'D' ? 'DARK' : 'DRAW'),
      moves: moves, // simple-json handles stringification
      rules: rules,
      moveTimings: moveTimings ?? null,
    });
    const saved = await this.historyRepository.save(game);

    // Home-dashboard daily streak (see UsersService.recordDailyPlay/streak.ts) — every
    // completed game, PvP or vs-AI, updates whichever side(s) are real accounts.
    // Awaited (unlike the CPU-heavy background review/anti-cheat passes triggered
    // elsewhere on game end) — this is a single cheap read+write, and callers/the
    // frontend reasonably expect the streak to already be current the moment
    // saveGame resolves, not "eventually". Still best-effort: a failure here must
    // never fail the game save itself, which has already succeeded by this point.
    try {
      if (lightPlayer) await this.usersService.recordDailyPlay(lightPlayer.id);
      if (darkPlayer) await this.usersService.recordDailyPlay(darkPlayer.id);
    } catch (err) {
      console.error('Failed to record daily play streak:', err);
    }

    return saved;
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
