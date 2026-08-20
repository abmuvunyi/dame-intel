import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { SwissRound } from './swiss-round.entity';
import { SwissPairingRecord } from './swiss-pairing.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, TournamentPlayer, SwissRound, SwissPairingRecord]),
    UsersModule,
    NotificationsModule,
  ],
  providers: [TournamentsService],
  controllers: [TournamentsController],
  exports: [TournamentsService],
})
export class TournamentsModule {}
