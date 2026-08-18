import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getMine(@Request() req: any) {
    return this.notificationsService.getForUser(req.user.sub);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    return { count: await this.notificationsService.getUnreadCount(req.user.sub) };
  }

  @Post(':id/read')
  async markRead(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.notificationsService.markRead(id, req.user.sub);
    return { success: true };
  }

  @Post('read-all')
  async markAllRead(@Request() req: any) {
    await this.notificationsService.markAllRead(req.user.sub);
    return { success: true };
  }
}
