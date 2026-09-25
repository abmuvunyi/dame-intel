import { initSentry, flushSentry } from './common/sentry';
// Initialise error tracking before anything else is loaded (no-op without SENTRY_DSN).
initSentry();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis.adapter';
import { allowedOrigins } from './config/cors';
import { configureApp } from './app.setup';

async function bootstrap() {
  // rawBody: true attaches the untouched request body (req.rawBody) alongside Nest's
  // usual JSON-parsed one, on every request. Needed specifically for the Stripe
  // webhook route (Phase 13) — Stripe's signature verification is computed over the
  // exact raw bytes, so a JSON.parse()-then-reserialize round trip would break it
  // even if the parsed content is byte-for-byte "the same" data.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });

  // Phase 14: structured JSON logs (pino) for every Nest log line and HTTP request.
  const logger = app.get(Logger);
  app.useLogger(logger);

  configureApp(app); // helmet, CORS allowlist, validation, error reporting (app.setup.ts)

  // Redis-backed Socket.IO adapter when REDIS_URL is reachable; otherwise the
  // in-memory adapter (fine for a single backend instance).
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  if (redisIoAdapter.isReady()) {
    app.useWebSocketAdapter(redisIoAdapter);
  } else {
    logger.warn('Redis unavailable — using the in-memory Socket.IO adapter.', 'Bootstrap');
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`Listening on port ${port}; CORS origins: ${allowedOrigins().join(', ') || '(none)'}`, 'Bootstrap');
}

process.on('unhandledRejection', (reason) => {
   
  console.error('Unhandled promise rejection:', reason);
});

bootstrap().catch(async (err) => {
   
  console.error('Fatal error during startup:', err);
  await flushSentry();
  process.exit(1);
});
