import { Module } from '@nestjs/common';
import { DraughtsEngine } from './engine/engine.service';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { UsersModule } from '../users/users.module';
import { HistoryModule } from '../history/history.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { AnalysisController } from './analysis.controller';

@Module({
  imports: [UsersModule, HistoryModule, TournamentsModule],
  providers: [DraughtsEngine, GameGateway, AiService],
  controllers: [AnalysisController]
})
export class GameModule {}