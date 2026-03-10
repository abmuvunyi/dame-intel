import { Controller, Get, UseGuards, Request, Param } from '@nestjs/common';
import { HistoryService } from './history.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('history')
export class HistoryController {
  constructor(private historyService: HistoryService) {}

  @UseGuards(AuthGuard)
  @Get('my-games')
  async getMyHistory(@Request() req: any) {
    return this.historyService.getPlayerHistory(req.user.sub);
  }

  // Allow fetching any player's history for profiles
  @Get('player/:id')
  async getPlayerHistory(@Param('id') id: string) {
    return this.historyService.getPlayerHistory(parseInt(id, 10));
  }
}
