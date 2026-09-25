import * as Sentry from '@sentry/node';

// Phase 14: optional error tracking. Completely inert unless SENTRY_DSN is set, so
// local development and tests never send anything. Any Sentry-compatible backend
// works (Sentry SaaS, self-hosted Sentry, GlitchTip) — no cloud-provider lock-in.
let enabled = false;

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
  });
  enabled = true;
  return enabled;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs);
}
