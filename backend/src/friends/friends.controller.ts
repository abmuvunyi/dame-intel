import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('friends')
@UseGuards(AuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  async getFriends(@Request() req: any) {
    return this.friendsService.getFriendsList(req.user.sub);
  }

  @Post('add')
  async addFriend(@Request() req: any, @Body('username') username: string) {
    return this.friendsService.sendFriendRequest(req.user.sub, username);
  }

  @Post('accept/:id')
  async acceptFriend(@Request() req: any, @Param('id') friendshipId: string) {
    return this.friendsService.acceptFriendRequest(req.user.sub, parseInt(friendshipId, 10));
  }
}
