import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS so Next.js frontend can connect
  app.enableCors();
  // Ensure the backend listens on port 3001
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
