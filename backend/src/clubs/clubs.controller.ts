import { Body, Controller, Get, Post, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  async getAllClubs() {
    return this.clubsService.getAllClubs();
  }

  // Must come before ':id' below, or Nest would try to parse 'mine' as a club id.
  @UseGuards(AuthGuard)
  @Get('mine')
  async getMyClubs(@Request() req: any) {
    return this.clubsService.getMyClubs(req.user.sub);
  }

  @Get(':id')
  async getClub(@Param('id', ParseIntPipe) id: number) {
    return this.clubsService.getClub(id);
  }

  @Get(':id/members')
  async getMembers(@Param('id', ParseIntPipe) id: number) {
    return this.clubsService.getClubMembers(id);
  }

  @UseGuards(AuthGuard)
  @Post()
  async createClub(@Request() req: any, @Body() body: { name: string, description?: string }) {
    return this.clubsService.createClub(req.user.sub, body.name, body.description);
  }

  @UseGuards(AuthGuard)
  @Post(':id/join')
  async joinClub(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.clubsService.joinClub(id, req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Post(':id/leave')
  async leaveClub(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.clubsService.leaveClub(id, req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Get(':id/posts')
  async getFeed(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.clubsService.getClubFeed(id, req.user.sub);
  }

  @UseGuards(AuthGuard)
  @Post(':id/posts')
  async createPost(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body('content') content: string) {
    return this.clubsService.postToClub(id, req.user.sub, content);
  }
}
