import { requiredPriceEnvNames } from '../billing/plans';

// Phase 14: fail fast on a misconfigured deployment instead of booting into an
// insecure or half-working state. Wired into ConfigModule.forRoot({ validate }), so it
// runs before any module that reads configuration.
//
// Hard errors (refuse to boot) apply only when NODE_ENV=production; in development
// the same problems are logged as warnings so `npm run start:dev` keeps working with
// zero configuration.

export const INSECURE_DEV_JWT_SECRET = 'DEFAULT_INSECURE_DEV_SECRET_DO_NOT_USE_IN_PROD';
const MIN_JWT_SECRET_LENGTH = 32;

export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
}

export function isProduction(env: Record<string, unknown> = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export function checkEnv(env: Record<string, unknown>): EnvCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const str = (key: string) => (typeof env[key] === 'string' ? (env[key]).trim() : '');

  // --- secrets that must never be defaulted in production ---
  const jwt = str('JWT_SECRET');
  if (!jwt) {
    errors.push('JWT_SECRET is required (generate one with: openssl rand -base64 48).');
  } else if (jwt === INSECURE_DEV_JWT_SECRET || jwt.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be a random value of at least ${MIN_JWT_SECRET_LENGTH} characters.`);
  }

  // --- infrastructure ---
  if (!str('DATABASE_URL') && !(str('DB_HOST') && str('DB_NAME') && str('DB_USER'))) {
    errors.push('A PostgreSQL database is required in production: set DATABASE_URL, or DB_HOST + DB_NAME + DB_USER (+ DB_PASSWORD, DB_PORT). The sqlite fallback is for local development only.');
  }
  if (!str('CORS_ORIGINS')) {
    errors.push('CORS_ORIGINS is required in production (comma-separated list of allowed frontend origins, e.g. https://play.example.com).');
  } else if (str('CORS_ORIGINS').split(',').some((o) => o.trim() === '*')) {
    errors.push('CORS_ORIGINS must list explicit origins in production, not "*".');
  }
  if (!str('APP_URL')) {
    errors.push('APP_URL is required in production (public frontend URL, used for Stripe redirects and email links).');
  }
  if (!str('REDIS_URL')) {
    warnings.push('REDIS_URL is not set — WebSocket fan-out uses the in-memory adapter (fine for a single backend instance).');
  }

  // --- optional integrations: all-or-nothing so a half-configured one fails loudly ---
  // Payments: all-or-nothing, so a half-configured Stripe setup fails loudly.
  // Every CURRENT paid plan version needs its price IDs (billing/plans.ts). Plus also
  // accepts the Phase 13 names STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL.
  const legacy: Record<string, string> = { STRIPE_PRICE_PLUS_MONTHLY: 'STRIPE_PRICE_MONTHLY', STRIPE_PRICE_PLUS_ANNUAL: 'STRIPE_PRICE_ANNUAL' };
  const has = (k: string) => !!str(k) || (!!legacy[k] && !!str(legacy[k]));
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', ...requiredPriceEnvNames()];
  const stripeSet = stripeKeys.filter(has);
  if (stripeSet.length > 0 && stripeSet.length < stripeKeys.length) {
    errors.push(`Stripe is partially configured — set all of ${stripeKeys.join(', ')} or none (missing: ${stripeKeys.filter((k) => !has(k)).join(', ')}).`);
  } else if (stripeSet.length === 0) {
    warnings.push('Stripe is not configured — membership checkout will return 503 (free trials still work).');
  }

  const trialPlan = str('TRIAL_PLAN');
  if (trialPlan && !['PLUS', 'PREMIUM'].includes(trialPlan.toUpperCase())) {
    errors.push('TRIAL_PLAN must be PLUS or PREMIUM.');
  }
  const trialDays = str('TRIAL_DAYS');
  if (trialDays && !(Number(trialDays) >= 1 && Number(trialDays) <= 90)) {
    errors.push('TRIAL_DAYS must be a whole number of days between 1 and 90.');
  }

  // Database: DATABASE_URL, or the separate DB_* variables many platforms inject.
  if (!str('RESEND_API_KEY')) {
    warnings.push('RESEND_API_KEY is not set — transactional emails are logged instead of sent.');
  } else if (!str('RESEND_FROM_EMAIL')) {
    errors.push('RESEND_FROM_EMAIL is required when RESEND_API_KEY is set.');
  }
  if (!str('ADMIN_USERNAMES')) {
    warnings.push('ADMIN_USERNAMES is not set — no account will be promoted to ADMIN at boot (use `npm run admin:grant -- <username>`).');
  }

  return { errors, warnings };
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const { errors, warnings } = checkEnv(config);
  const prod = isProduction(config);
  // Plain console here on purpose: this runs before Nest's logger exists.
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length > 0) {
    if (prod) {
      throw new Error(`Invalid production configuration:\n  - ${errors.join('\n  - ')}`);
    }
    for (const e of errors) console.warn(`[config] (would fail in production) ${e}`);
  }
  return config;
}
