import { Body, Controller, Get, Post, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
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
  async getStandings(@Param('id', ParseIntPipe) id: number) {
    return this.tournamentsService.getStandingsWithTiebreak(id);
  }

  @UseGuards(AuthGuard)
  @Post(':id/join')
  async joinTournament(@Param('id') id: string, @Request() req: any) {
    return this.tournamentsService.joinTournament(parseInt(id, 10), req.user.sub);
  }

  // --- Swiss lifecycle (SCHEDULED -> REGISTRATION_OPEN -> IN_PROGRESS -> COMPLETED) ---
  // No admin-role system exists in this codebase (same simplification as Phase 7's
  // puzzle admin routes) — these just require being logged in.

  @UseGuards(AuthGuard)
  @Post()
  async createTournament(@Body() body: { name: string, format: string, totalRounds?: number }) {
    return this.tournamentsService.createTournament(body.name, body.format, body.totalRounds);
  }

  @UseGuards(AuthGuard)
  @Post(':id/open-registration')
  async openRegistration(@Param('id', ParseIntPipe) id: number) {
    return this.tournamentsService.openRegistration(id);
  }

  @UseGuards(AuthGuard)
  @Post(':id/start')
  async startTournament(@Param('id', ParseIntPipe) id: number) {
    return this.tournamentsService.startTournament(id);
  }

  @Get(':id/rounds/:roundNumber')
  async getRoundPairings(@Param('id', ParseIntPipe) id: number, @Param('roundNumber', ParseIntPipe) roundNumber: number) {
    return this.tournamentsService.getRoundPairings(id, roundNumber);
  }
}
