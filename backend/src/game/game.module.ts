import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DraughtsEngine } from './engine/engine.service';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { UsersModule } from '../users/users.module';
import { HistoryModule } from '../history/history.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { AnalysisController } from './analysis.controller';
import { AnticheatModule } from '../anticheat/anticheat.module';
import { RatingModule } from '../rating/rating.module';
import { PresenceModule } from '../presence/presence.module';
import { GameReview } from './review/game-review.entity';
import { GameReviewService } from './review/game-review.service';
import { GameReviewController } from './review/game-review.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameReview]),
    UsersModule,
    HistoryModule,
    TournamentsModule,
    AnticheatModule,
    RatingModule,
    PresenceModule,
  ],
  providers: [DraughtsEngine, GameGateway, AiService, GameReviewService],
  controllers: [AnalysisController, GameReviewController],
  exports: [GameReviewService],
})
export class GameModule {}
