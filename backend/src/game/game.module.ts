import { Module } from '@nestjs/common';
import { DraughtsEngine } from './engine/engine.service';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';

@Module({
  providers: [DraughtsEngine, GameGateway, AiService]
})
export class GameModule {}