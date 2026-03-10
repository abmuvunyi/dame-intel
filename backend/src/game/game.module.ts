import { Module } from '@nestjs/common';
import { DraughtsEngine } from './engine/engine.service';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { UsersModule } from '../users/users.module';
import { HistoryModule } from '../history/history.module';

@Module({
  imports: [UsersModule, HistoryModule],
  providers: [DraughtsEngine, GameGateway, AiService]
})
export class GameModule {}