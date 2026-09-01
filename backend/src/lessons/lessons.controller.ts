import { Controller, Get, Param, Query } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import type { LessonCategory } from './lesson.entity';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  // Deliberately unauthenticated, like puzzles' own /puzzles/daily — instructional
  // content is free for everyone, not a login-gated feature.
  @Get()
  async listAll(@Query('category') category?: LessonCategory) {
    return this.lessonsService.listAll(category);
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.lessonsService.getBySlug(slug);
  }
}
