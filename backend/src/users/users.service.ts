import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findOneByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ username });
  }

  findOneById(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async create(username: string, passwordHash: string): Promise<User> {
    const user = this.usersRepository.create({ username, passwordHash });
    return this.usersRepository.save(user);
  }

  async updateRating(id: number, ratingDelta: number, result: 'win' | 'loss' | 'draw'): Promise<User | null> {
      const user = await this.usersRepository.findOneBy({ id });
      if (!user) return null;

      user.rating = Math.max(100, user.rating + ratingDelta); // Rating floor of 100
      user.gamesPlayed += 1;
      if (result === 'win') user.wins += 1;
      else if (result === 'loss') user.losses += 1;
      else if (result === 'draw') user.draws += 1;

      return this.usersRepository.save(user);
  }

  async getRankings(limit: number = 100): Promise<User[]> {
    return this.usersRepository.find({
      order: { rating: 'DESC' },
      take: limit,
      select: ['id', 'username', 'rating', 'gamesPlayed', 'wins', 'losses', 'draws'],
    });
  }

  async getRatingStats(): Promise<{ bucket: string; count: number }[]> {
    // Basic distribution in buckets of 200 ELO
    const users = await this.usersRepository.find({ select: ['rating'] });
    const buckets: Record<string, number> = {};

    users.forEach((u) => {
      const bucketStart = Math.floor(u.rating / 200) * 200;
      const bucketName = `${bucketStart}-${bucketStart + 199}`;
      buckets[bucketName] = (buckets[bucketName] || 0) + 1;
    });

    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }

  // Calculates the standard ELO rating change
  calculateEloChange(ratingA: number, ratingB: number, result: 'win' | 'loss' | 'draw', gamesPlayed: number): number {
    // Determine K-Factor (How volatile the rating is)
    let k = 20; // Standard
    if (gamesPlayed < 30) {
      k = 40; // High volatility for new players (Provisional)
    } else if (ratingA > 2400) {
      k = 10; // Low volatility for Grandmasters
    }

    // Expected win probability (0.0 to 1.0)
    const expectedScore = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));

    // Actual score
    let actualScore = 0.5; // Draw
    if (result === 'win') actualScore = 1.0;
    if (result === 'loss') actualScore = 0.0;

    // Calculate rating delta
    return Math.round(k * (actualScore - expectedScore));
  }
}
