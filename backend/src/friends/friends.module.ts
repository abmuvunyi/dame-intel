import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { Friendship } from './friendship.entity';
import { UsersModule } from '../users/users.module';
import { PresenceModule } from '../presence/presence.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship]),
    UsersModule,
    PresenceModule,
    NotificationsModule,
  ],
  providers: [FriendsService],
  controllers: [FriendsController]
})
export class FriendsModule {}
