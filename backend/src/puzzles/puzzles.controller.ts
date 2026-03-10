import { Controller, Get, Query } from '@nestjs/common';
import { PuzzlesService } from './puzzles.service';

@Controller('puzzles')
export class PuzzlesController {
  constructor(private readonly puzzlesService: PuzzlesService) {}

  @Get('random')
  async getRandomPuzzle(@Query('difficulty') difficulty?: string) {
    const diff = difficulty ? parseInt(difficulty, 10) : undefined;
    return this.puzzlesService.getRandomPuzzle(diff);
  }
}
