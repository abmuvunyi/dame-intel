import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { Tournament } from './tournament.entity';
import { TournamentPlayer } from './tournament-player.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, TournamentPlayer]),
    UsersModule,
  ],
  providers: [TournamentsService],
  controllers: [TournamentsController],
})
export class TournamentsModule {}
