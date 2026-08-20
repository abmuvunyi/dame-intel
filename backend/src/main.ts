import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis.adapter';

async function bootstrap() {
  // rawBody: true attaches the untouched request body (req.rawBody) alongside Nest's
  // usual JSON-parsed one, on every request. Needed specifically for the Stripe
  // webhook route (Phase 13) — Stripe's signature verification is computed over the
  // exact raw bytes, so a JSON.parse()-then-reserialize round trip would break it
  // even if the parsed content is byte-for-byte "the same" data.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Enable CORS so Next.js frontend can connect
  app.enableCors();

  // Try connecting to Redis for WebSocket scaling
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis().catch(err => {
    console.warn('Could not connect to Redis, falling back to in-memory adapter.');
  });
  if (redisIoAdapter.isReady()) {
     app.useWebSocketAdapter(redisIoAdapter);
  }

  // Ensure the backend listens on port 3001
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
