import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Phase 14: probes for any cloud host / orchestrator / uptime monitor.
//   GET /health/live  — the process is up (no dependencies checked). Use for liveness.
//   GET /health       — the process can serve traffic: database reachable. Use for
//                       readiness and load-balancer health checks. 503 when not ready.
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get()
  async ready() {
    const started = Date.now();
    let db: 'up' | 'down' = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
    const body = {
      status: db === 'up' ? 'ok' : 'error',
      checks: { database: db },
      dbLatencyMs: Date.now() - started,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      version: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
    };
    if (db !== 'up') throw new ServiceUnavailableException(body);
    return body;
  }
}
