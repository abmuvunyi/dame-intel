import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  async getUpcoming() {
    return this.tournamentsService.getUpcomingTournaments();
  }

  @Get(':id')
  async getTournament(@Param('id') id: string) {
    return this.tournamentsService.getTournament(parseInt(id, 10));
  }

  @Get(':id/standings')
  async getStandings(@Param('id') id: string) {
    return this.tournamentsService.getStandings(parseInt(id, 10));
  }

  @UseGuards(AuthGuard)
  @Post(':id/join')
  async joinTournament(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.joinTournament(parseInt(id, 10), req.user.sub);
  }
}
