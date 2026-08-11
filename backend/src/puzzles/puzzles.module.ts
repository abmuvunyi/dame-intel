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

@Module({
  imports: [
    // GameHistory is registered here (in addition to HistoryModule's own
    // registration) purely for the generator's read access to completed games —
    // HistoryModule only exports HistoryService, not its repository, and its
    // existing methods are scoped to one player/one game, not "all recent games".
    TypeOrmModule.forFeature([Puzzle, PlayerPuzzleRating, PuzzleRushSession, GameHistory]),
  ],
  providers: [PuzzlesService, PuzzleRushService, PuzzleGeneratorService],
  controllers: [PuzzlesController],
  exports: [PuzzlesService],
})
export class PuzzlesModule {}
