import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzlesService } from './puzzles.service';
import { PuzzlesController } from './puzzles.controller';
import { PuzzleRushService } from './puzzle-rush.service';
import { PuzzleGeneratorService } from './puzzle-generator.service';
import { Puzzle } from './puzzle.entity';
import { PlayerPuzzleRating } from './player-puzzle-rating.entity';
import { PuzzleRushSession } from './puzzle-rush-session.entity';
import { GameHistory } from '../history/history.entity';
import { UsersModule } from '../users/users.module';
import { AiService } from '../game/ai/ai/ai.service';

@Module({
  imports: [
    // GameHistory is registered here (in addition to HistoryModule's own
    // registration) purely for the generator's read access to completed games —
    // HistoryModule only exports HistoryService, not its repository, and its
    // existing methods are scoped to one player/one game, not "all recent games".
    TypeOrmModule.forFeature([Puzzle, PlayerPuzzleRating, PuzzleRushSession, GameHistory]),
    UsersModule, // Phase 13: needed to resolve a caller's membership tier for premium-puzzle gating
  ],
  // AiService has no dependencies of its own (see ai.service.ts), so providing it
  // again here — rather than importing GameModule, which doesn't export it — is the
  // simplest correct wiring; NestJS gives this module its own instance, which is
  // fine since AiService carries no state across calls beyond what each top-level
  // search call itself resets.
  providers: [PuzzlesService, PuzzleRushService, PuzzleGeneratorService, AiService],
  controllers: [PuzzlesController],
  exports: [PuzzlesService],
})
export class PuzzlesModule {}
