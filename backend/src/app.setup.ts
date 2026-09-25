import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';
import { corsOptions } from './config/cors';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

export const API_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';

// Phase 14: every piece of HTTP hardening in one place, applied identically by
// main.ts and by the e2e tests (so the tests exercise the real production pipeline).
export function configureApp(app: INestApplication): void {
  // Behind a cloud load balancer / reverse proxy the client IP arrives in
  // X-Forwarded-For. Needed for correct per-IP rate limiting and request logs.
  // TRUST_PROXY = number of proxy hops (default 1), or "false" to disable.
  const trustProxy = process.env.TRUST_PROXY ?? '1';
  if (trustProxy !== 'false') {
    app.getHttpAdapter().getInstance().set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }

  // Phase 15: API versioning. Every HTTP route lives under /api/v1/... so a future
  // breaking change can ship as /api/v2 while v1 keeps working for existing clients
  // (web, and later mobile apps). Health probes stay unversioned for infrastructure.
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_DEFAULT_VERSION });

  // This is a JSON API (no HTML), so helmet's defaults are safe as-is.
  app.use(helmet());
  app.enableCors(corsOptions);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that aren't declared on a DTO
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableShutdownHooks();
}
