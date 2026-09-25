import 'dotenv/config';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

// One source of truth for database configuration, shared by the running app
// (AppModule) and the TypeORM migration CLI (the default export below).
//
// Production database: PostgreSQL — the one relational database every major cloud
// offers as a managed service (AWS RDS/Aurora, Google Cloud SQL/AlloyDB, Azure
// Database for PostgreSQL, DigitalOcean, Render, Railway, Fly, Heroku, Supabase,
// Neon, Aiven, Crunchy…). Supported and tested in CI: PostgreSQL 13 through 17. Only
// portable features are used (no extensions, no provider-specific types), so moving
// between providers is a dump/restore.
//
// Connection settings, whichever style the platform provides:
//   - DATABASE_URL=postgres://user:pass@host:5432/db[?sslmode=require]
//   - or DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (common on AWS/Kubernetes)
// TLS: DB_SSL=true (verifies the server certificate; add DB_SSL_CA for a private CA),
// or an `sslmode` in the URL (disable | require | verify-ca | verify-full | no-verify).
//
// Schema is managed ONLY by migrations (src/database/migrations), applied at boot
// unless DB_MIGRATIONS_RUN=false. Without any Postgres settings, a local sqlite file
// with `synchronize` is used — development only (production refuses to boot).

const entities = [join(__dirname, '..', '**', '*.entity{.ts,.js}')];
const migrations = [join(__dirname, 'migrations', '*{.ts,.js}')];

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

type SslMode = 'disable' | 'require' | 'verify' | 'no-verify';

/** Removes TLS query parameters from a connection URL (so they can't silently override DB_SSL*) and reports the sslmode. */
export function splitSslFromUrl(url: string): { url: string; sslMode: SslMode | null } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, sslMode: null };
  }
  const raw = (parsed.searchParams.get('sslmode') ?? (parsed.searchParams.get('ssl') === 'true' ? 'require' : null))?.toLowerCase() ?? null;
  for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) parsed.searchParams.delete(key);
  const sslMode: SslMode | null =
    raw === null ? null
    : raw === 'disable' || raw === 'allow' || raw === 'prefer' ? 'disable'
    : raw === 'no-verify' ? 'no-verify'
    : raw === 'verify-ca' || raw === 'verify-full' ? 'verify'
    : 'require';
  return { url: parsed.toString(), sslMode };
}

export function postgresSsl(env: NodeJS.ProcessEnv = process.env, urlSslMode: SslMode | null = null): PostgresConnectionOptions['ssl'] {
  // DB_SSL (explicit) wins over the URL's sslmode; neither → no TLS.
  const enabled = env.DB_SSL !== undefined && env.DB_SSL !== ''
    ? bool(env.DB_SSL, false)
    : urlSslMode !== null && urlSslMode !== 'disable';
  if (!enabled) return false;
  const rejectDefault = urlSslMode !== 'no-verify';
  return {
    // Verify the server certificate by default. Only turn this off for a provider
    // that uses a self-signed certificate AND doesn't publish its CA — prefer
    // supplying DB_SSL_CA (PEM contents) instead.
    rejectUnauthorized: bool(env.DB_SSL_REJECT_UNAUTHORIZED, rejectDefault),
    ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') } : {}),
  };
}

export function usesPostgres(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.DATABASE_URL || !!env.DB_HOST;
}

export function buildDataSourceOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  if (usesPostgres(env)) {
    const common = {
      type: 'postgres' as const,
      entities,
      migrations,
      synchronize: false,
      migrationsRun: bool(env.DB_MIGRATIONS_RUN, true),
      migrationsTransactionMode: 'each' as const,
      applicationName: env.DB_APPLICATION_NAME || 'dame-intel',
      extra: {
        max: Number(env.DB_POOL_SIZE) || 10,
        connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS) || 10_000,
        ...(Number(env.DB_STATEMENT_TIMEOUT_MS) > 0 ? { statement_timeout: Number(env.DB_STATEMENT_TIMEOUT_MS) } : {}),
      },
    };
    if (env.DATABASE_URL) {
      const { url, sslMode } = splitSslFromUrl(env.DATABASE_URL);
      return { ...common, url, ssl: postgresSsl(env, sslMode) };
    }
    return {
      ...common,
      host: env.DB_HOST,
      port: Number(env.DB_PORT) || 5432,
      database: env.DB_NAME,
      username: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: postgresSsl(env),
    };
  }
  return {
    type: 'sqlite',
    database: env.SQLITE_PATH || 'draughts_db.sqlite',
    entities,
    synchronize: true,
  };
}

export default new DataSource(buildDataSourceOptions());
