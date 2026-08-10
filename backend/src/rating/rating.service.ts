import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerRating } from './player-rating.entity';
import { RatingHistoryEntry } from './rating-history.entity';
import { updateRating, GLICKO2_DEFAULTS } from './glicko2';

export const PROVISIONAL_GAMES_THRESHOLD = 20; // "first ~15-20 games" per the brief

export interface PoolRating {
  variant: string;
  timeControl: string;
  rating: number;
  ratingDeviation: number;
  volatility: number;
  gamesPlayed: number;
  provisional: boolean;
}

@Injectable()
export class RatingService {
  constructor(
    @InjectRepository(PlayerRating)
    private readonly ratingsRepo: Repository<PlayerRating>,
    @InjectRepository(RatingHistoryEntry)
    private readonly historyRepo: Repository<RatingHistoryEntry>,
  ) {}

  async getOrCreateRating(userId: number, variant: string, timeControl: string): Promise<PlayerRating> {
    let row = await this.ratingsRepo.findOneBy({ userId, variant, timeControl });
    if (!row) {
      row = this.ratingsRepo.create({ userId, variant, timeControl, ...GLICKO2_DEFAULTS });
      row = await this.ratingsRepo.save(row);
    }
    return row;
  }

  private toPoolRating(row: PlayerRating): PoolRating {
    return {
      variant: row.variant,
      timeControl: row.timeControl,
      rating: row.rating,
      ratingDeviation: row.ratingDeviation,
      volatility: row.volatility,
      gamesPlayed: row.gamesPlayed,
      provisional: row.gamesPlayed < PROVISIONAL_GAMES_THRESHOLD,
    };
  }

  async getCurrentRatings(userId: number): Promise<PoolRating[]> {
    const rows = await this.ratingsRepo.find({ where: { userId } });
    return rows.map(r => this.toPoolRating(r));
  }

  async getHistory(userId: number, variant?: string, timeControl?: string): Promise<RatingHistoryEntry[]> {
    return this.historyRepo.find({
      where: { userId, ...(variant ? { variant } : {}), ...(timeControl ? { timeControl } : {}) },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Records one completed rated game's result and updates both players' ratings in
   * the given (variant, timeControl) pool. Each game is treated as its own
   * single-opponent Glicko-2 rating period — see glicko2.ts's module comment for why.
   */
  async recordGameResult(
    player1: { userId: number },
    player2: { userId: number },
    variant: string,
    timeControl: string,
    result: 'p1win' | 'p2win' | 'draw',
  ): Promise<{ player1: PoolRating; player2: PoolRating }> {
    const [p1Row, p2Row] = await Promise.all([
      this.getOrCreateRating(player1.userId, variant, timeControl),
      this.getOrCreateRating(player2.userId, variant, timeControl),
    ]);

    const p1Score = result === 'p1win' ? 1 : result === 'p2win' ? 0 : 0.5;
    const p2Score = 1 - p1Score;

    const p1New = updateRating(
      { rating: p1Row.rating, ratingDeviation: p1Row.ratingDeviation, volatility: p1Row.volatility },
      [{ rating: p2Row.rating, ratingDeviation: p2Row.ratingDeviation, score: p1Score }],
    );
    const p2New = updateRating(
      { rating: p2Row.rating, ratingDeviation: p2Row.ratingDeviation, volatility: p2Row.volatility },
      [{ rating: p1Row.rating, ratingDeviation: p1Row.ratingDeviation, score: p2Score }],
    );

    p1Row.rating = p1New.rating;
    p1Row.ratingDeviation = p1New.ratingDeviation;
    p1Row.volatility = p1New.volatility;
    p1Row.gamesPlayed += 1;

    p2Row.rating = p2New.rating;
    p2Row.ratingDeviation = p2New.ratingDeviation;
    p2Row.volatility = p2New.volatility;
    p2Row.gamesPlayed += 1;

    await this.ratingsRepo.save([p1Row, p2Row]);

    const p1Result = p1Score === 1 ? 'win' : p1Score === 0 ? 'loss' : 'draw';
    const p2Result = p1Score === 1 ? 'loss' : p1Score === 0 ? 'win' : 'draw';

    await this.historyRepo.save([
      this.historyRepo.create({
        userId: player1.userId, variant, timeControl,
        rating: p1Row.rating, ratingDeviation: p1Row.ratingDeviation, volatility: p1Row.volatility,
        opponentUserId: player2.userId, result: p1Result,
      }),
      this.historyRepo.create({
        userId: player2.userId, variant, timeControl,
        rating: p2Row.rating, ratingDeviation: p2Row.ratingDeviation, volatility: p2Row.volatility,
        opponentUserId: player1.userId, result: p2Result,
      }),
    ]);

    return { player1: this.toPoolRating(p1Row), player2: this.toPoolRating(p2Row) };
  }
}
