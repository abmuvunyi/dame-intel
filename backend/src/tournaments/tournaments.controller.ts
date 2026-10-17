import { Body, Controller, ForbiddenException, Get, NotFoundException, Optional, Post, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { AuthGuard } from '../auth/auth.guard';
import { PERMISSIONS } from '../access/roles';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { CreateTournamentDto } from './create-tournament.dto';

@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly usersService: UsersService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  // Phase 15: staff organizers (tournaments.manage) can manage any tournament; Pro
  // players (hostTournaments entitlement) can create tournaments and manage their own.
  private canHost(user: any): boolean {
    return this.usersService.hasPermission(user, PERMISSIONS.TOURNAMENTS_MANAGE)
      || this.usersService.accessFor(user).entitlements.hostTournaments;
  }

  private async assertCanManage(req: any, tournamentId: number): Promise<void> {
    const user = req.authUser;
    if (this.usersService.hasPermission(user, PERMISSIONS.TOURNAMENTS_MANAGE)) return;
    const t = await this.tournamentsService.getTournament(tournamentId);
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.createdByUserId !== user?.id || !this.usersService.accessFor(user).entitlements.hostTournaments) {
      throw new ForbiddenException('Only tournament organizers, or the Pro member who created it, can manage this tournament.');
    }
  }

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
  @UseGuards(AuthGuard)
  @Post()
  async createTournament(@Request() req: any, @Body() body: CreateTournamentDto) {
    if (!this.canHost(req.authUser)) {
      throw new ForbiddenException('Creating tournaments requires the Organizer role or a Pro membership.');
    }
    const created = await this.tournamentsService.createTournament(body.name, body.format, {
      createdByUserId: req.user.sub,
      totalRounds: body.totalRounds,
      maxParticipants: body.maxParticipants,
      timeControl: body.timeControl,
      boardSize: body.boardSize,
      variant: body.variant,
      pointsWin: body.pointsWin,
      pointsDraw: body.pointsDraw,
      pointsLoss: body.pointsLoss,
    });
    await this.audit?.record({
      action: 'tournament.created', actorUserId: req.user.sub, targetType: 'tournament', targetId: created.id,
      details: { name: created.name, format: created.format }, req,
    });
    return created;
  }

  @UseGuards(AuthGuard)
  @Post(':id/open-registration')
  async openRegistration(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.assertCanManage(req, id);
    const t = await this.tournamentsService.openRegistration(id);
    await this.audit?.record({ action: 'tournament.registration_opened', actorUserId: req.user.sub, targetType: 'tournament', targetId: id, req });
    return t;
  }

  @UseGuards(AuthGuard)
  @Post(':id/start')
  async startTournament(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.assertCanManage(req, id);
    const t = await this.tournamentsService.startTournament(id);
    await this.audit?.record({ action: 'tournament.started', actorUserId: req.user.sub, targetType: 'tournament', targetId: id, req });
    return t;
  }

  @Get(':id/rounds/:roundNumber')
  async getRoundPairings(@Param('id', ParseIntPipe) id: number, @Param('roundNumber', ParseIntPipe) roundNumber: number) {
    return this.tournamentsService.getRoundPairings(id, roundNumber);
  }
}
