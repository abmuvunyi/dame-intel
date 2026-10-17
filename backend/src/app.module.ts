import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { HttpThrottlerGuard } from './common/http-throttler.guard';
import { HealthController } from './health/health.controller';
import { ConfigModule } from '@nestjs/config';
import { buildDataSourceOptions } from './database/data-source';
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
import { RatingModule } from './rating/rating.module';
import { ClubsModule } from './clubs/clubs.module';
import { PresenceModule } from './presence/presence.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LessonsModule } from './lessons/lessons.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv, // Phase 14: refuse to boot a misconfigured production deploy
    }),
    // Phase 14: structured request/app logging (JSON in production, pretty in dev).
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json'
          ? undefined
          : { target: 'pino-pretty', options: { singleLine: true } },
        // Reuse an upstream request id (load balancer / API gateway) when present.
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["stripe-signature"]'],
        autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      },
    }),
    // Phase 14: default HTTP rate limit per client IP (auth routes are stricter, see
    // auth.controller.ts). In-memory store: limits are per backend instance.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300 },
    ]),
    // Phase 14: see database/data-source.ts — Postgres + migrations when
    // DATABASE_URL is set, local sqlite (dev only) otherwise.
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    GameModule,
    UsersModule,
    AuthModule,
    HistoryModule,
    PuzzlesModule,
    TournamentsModule,
    FriendsModule,
    AnticheatModule,
    RatingModule,
    ClubsModule,
    PresenceModule,
    SubscriptionsModule,
    NotificationsModule,
    LessonsModule,
    AuditModule,
    AdminModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
