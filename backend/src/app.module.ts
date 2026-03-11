import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HistoryModule } from './history/history.module';
import { PuzzlesModule } from './puzzles/puzzles.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { ScheduleModule } from '@nestjs/schedule';
import { FriendsModule } from './friends/friends.module';
import { AnticheatModule } from './anticheat/anticheat.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'draughts_db.sqlite',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // Auto-create tables in dev. For production, use migrations!
      // Using SQLite purely because Docker Hub Rate limits prevent PostgreSQL container from starting on this specific sandbox.
      // In a real environment, use the Postgres block.
    }),
    GameModule,
    UsersModule,
    AuthModule,
    HistoryModule,
    PuzzlesModule,
    TournamentsModule,
    FriendsModule,
    AnticheatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
