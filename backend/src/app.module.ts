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
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'draughts_user',
      password: process.env.DB_PASSWORD || 'draughts_password',
      database: process.env.DB_NAME || 'draughts_db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // Auto-create tables in dev. For production, use migrations!
      // Fallback to sqlite if postgres is totally inaccessible for local dev without docker
      // In production, this block should strictly be postgres
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
