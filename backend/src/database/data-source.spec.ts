import { buildDataSourceOptions, postgresSsl, splitSslFromUrl } from './data-source';

describe('database configuration (cloud portability)', () => {
  it('uses Postgres with migrations (never synchronize) when DATABASE_URL is set', () => {
    const o: any = buildDataSourceOptions({ DATABASE_URL: 'postgres://u:p@db:5432/app' });
    expect(o.type).toBe('postgres');
    expect(o.synchronize).toBe(false);
    expect(o.migrationsRun).toBe(true);
    expect(o.ssl).toBe(false);
  });

  it('accepts separate DB_* variables (AWS / Kubernetes style)', () => {
    const o: any = buildDataSourceOptions({ DB_HOST: 'db.internal', DB_NAME: 'app', DB_USER: 'u', DB_PASSWORD: 'p', DB_PORT: '6543' });
    expect(o).toMatchObject({ type: 'postgres', host: 'db.internal', port: 6543, database: 'app', username: 'u', password: 'p' });
  });

  it('falls back to sqlite (dev only) without any Postgres settings', () => {
    expect(buildDataSourceOptions({} as any).type).toBe('sqlite');
  });

  it.each([
    ['?sslmode=require', { rejectUnauthorized: true }],
    ['?sslmode=verify-full', { rejectUnauthorized: true }],
    ['?sslmode=no-verify', { rejectUnauthorized: false }],
    ['?sslmode=disable', false],
    ['', false],
  ])('understands provider URLs with %s', (query, expected) => {
    const o: any = buildDataSourceOptions({ DATABASE_URL: `postgres://u:p@db:5432/app${query}` });
    expect(o.ssl).toEqual(expected);
    expect(o.url).not.toContain('sslmode');
  });

  it('DB_SSL overrides the URL, and DB_SSL_CA is honoured', () => {
    expect(postgresSsl({ DB_SSL: 'false' } as any, 'require')).toBe(false);
    expect(postgresSsl({ DB_SSL: 'true', DB_SSL_CA: 'line1\\nline2' } as any, null)).toEqual({ rejectUnauthorized: true, ca: 'line1\nline2' });
  });

  it('keeps other URL parameters intact', () => {
    const { url, sslMode } = splitSslFromUrl('postgres://u:p@h:5432/db?sslmode=require&options=-c%20search_path%3Dapp');
    expect(sslMode).toBe('require');
    expect(url).toContain('options=');
  });
});
