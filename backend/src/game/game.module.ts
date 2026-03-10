import { Module } from '@nestjs/common';
import { DraughtsEngine } from './engine/engine.service';
import { GameGateway } from './game.gateway';

@Module({
  providers: [DraughtsEngine, GameGateway]
})
export class GameModule {}