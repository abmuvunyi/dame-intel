import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnticheatService } from './anticheat.service';
import { CheatFlag } from './cheat-flag.entity';
import { AiService } from '../game/ai/ai/ai.service'; // We need the AI service to re-evaluate moves

@Module({
  imports: [
    TypeOrmModule.forFeature([CheatFlag]),
  ],
  providers: [AnticheatService, AiService],
  exports: [AnticheatService],
})
export class AnticheatModule {}
