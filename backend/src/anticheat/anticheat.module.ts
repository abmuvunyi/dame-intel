import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnticheatService } from './anticheat.service';
import { AnticheatController } from './anticheat.controller';
import { CheatFlag } from './cheat-flag.entity';
import { AiService } from '../game/ai/ai/ai.service'; // We need the AI service to re-evaluate moves
import { UsersModule } from '../users/users.module';
import { HistoryModule } from '../history/history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CheatFlag]),
    UsersModule,
    HistoryModule,
  ],
  providers: [AnticheatService, AiService],
  controllers: [AnticheatController],
  exports: [AnticheatService],
})
export class AnticheatModule {}
