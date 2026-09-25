import { checkEnv, validateEnv } from './env.validation';

const GOOD_PROD = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(48),
  DATABASE_URL: 'postgres://u:p@db:5432/draughts',
  CORS_ORIGINS: 'https://play.example.com',
  APP_URL: 'https://play.example.com',
};

describe('env validation (Phase 14)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a complete production configuration', () => {
    expect(checkEnv(GOOD_PROD).errors).toEqual([]);
    expect(() => validateEnv({ ...GOOD_PROD })).not.toThrow();
  });

  it.each([
    ['JWT_SECRET', undefined, /JWT_SECRET is required/],
    ['JWT_SECRET', 'short', /at least 32/],
    ['JWT_SECRET', 'DEFAULT_INSECURE_DEV_SECRET_DO_NOT_USE_IN_PROD', /at least 32/],
    ['DATABASE_URL', undefined, /PostgreSQL database is required/],
    ['CORS_ORIGINS', undefined, /CORS_ORIGINS/],
    ['CORS_ORIGINS', '*', /not "\*"/],
    ['APP_URL', undefined, /APP_URL/],
  ])('refuses to boot in production when %s=%s', (key, value, message) => {
    const env: Record<string, unknown> = { ...GOOD_PROD, [key]: value };
    expect(() => validateEnv(env)).toThrow(message);
  });

  it('rejects a half-configured Stripe setup', () => {
    expect(() => validateEnv({ ...GOOD_PROD, STRIPE_SECRET_KEY: 'sk_live_x' })).toThrow(/Stripe is partially configured/);
  });

  it('accepts a fully configured Stripe setup', () => {
    expect(() =>
      validateEnv({
        ...GOOD_PROD,
        STRIPE_SECRET_KEY: 'sk',
        STRIPE_WEBHOOK_SECRET: 'wh',
        STRIPE_PRICE_PREMIUM_MONTHLY: 'p1',
        STRIPE_PRICE_PREMIUM_ANNUAL: 'p2',
        STRIPE_PRICE_PRO_MONTHLY: 'p3',
        STRIPE_PRICE_PRO_ANNUAL: 'p4',
      }),
    ).not.toThrow();
  });

  it('rejects Stripe with only the old single-tier prices (Pro prices missing)', () => {
    expect(() =>
      validateEnv({ ...GOOD_PROD, STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', STRIPE_PRICE_MONTHLY: 'p1', STRIPE_PRICE_ANNUAL: 'p2' }),
    ).toThrow(/STRIPE_PRICE_PRO_MONTHLY/);
  });

  it('accepts separate DB_* variables instead of DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = GOOD_PROD;
    expect(() => validateEnv({ ...rest, DB_HOST: 'db.internal', DB_NAME: 'draughts', DB_USER: 'app' })).not.toThrow();
    expect(() => validateEnv({ ...rest })).toThrow(/PostgreSQL database is required/);
  });

  it('validates trial settings', () => {
    expect(() => validateEnv({ ...GOOD_PROD, TRIAL_PLAN: 'FREE' })).toThrow(/TRIAL_PLAN/);
    expect(() => validateEnv({ ...GOOD_PROD, TRIAL_DAYS: '365' })).toThrow(/TRIAL_DAYS/);
    expect(() => validateEnv({ ...GOOD_PROD, TRIAL_PLAN: 'pro', TRIAL_DAYS: '14' })).not.toThrow();
  });

  it('requires a from-address when email sending is enabled', () => {
    expect(() => validateEnv({ ...GOOD_PROD, RESEND_API_KEY: 're_x' })).toThrow(/RESEND_FROM_EMAIL/);
  });

  it('only warns (never throws) outside production, so local dev needs zero config', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validateEnv({})).not.toThrow();
  });
});
