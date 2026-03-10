import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzlesService } from './puzzles.service';
import { PuzzlesController } from './puzzles.controller';
import { Puzzle } from './puzzle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Puzzle])],
  providers: [PuzzlesService],
  controllers: [PuzzlesController],
})
export class PuzzlesModule {}
