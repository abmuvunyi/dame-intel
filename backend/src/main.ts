import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
