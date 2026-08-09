import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('rankings')
  getRankings(@Query('limit') limit?: string) {
    const l = limit ? parseInt(limit, 10) : 100;
    return this.usersService.getRankings(l);
  }

  @Get('stats')
  getStats() {
    return this.usersService.getRatingStats();
  }
}
