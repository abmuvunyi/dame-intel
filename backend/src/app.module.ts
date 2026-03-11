import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get('DATABASE_URL');
        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: true, // Auto-create tables in dev. For production, use migrations!
            ssl: { rejectUnauthorized: false } // Needed for many managed Postgres providers
          };
        }
        return {
          type: 'sqlite',
          database: 'draughts_db.sqlite',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: true,
        };
      }
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
