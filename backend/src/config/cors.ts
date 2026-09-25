// Phase 14: explicit CORS allowlist shared by HTTP (main.ts) and the Socket.IO gateway.
// CORS_ORIGINS is a comma-separated list of exact origins, e.g.
//   CORS_ORIGINS=https://play.example.com,https://www.example.com
// Unset in development → allow the local Next.js dev server only.

const DEV_DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.CORS_ORIGINS ?? '').trim();
  if (!raw) return env.NODE_ENV === 'production' ? [] : DEV_DEFAULT_ORIGINS;
  return raw.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  // Requests with no Origin header (server-to-server, curl, health checks, Stripe
  // webhooks) aren't subject to CORS at all — browsers always send Origin.
  if (!origin) return true;
  const list = allowedOrigins(env);
  if (list.includes('*')) return true;
  return list.includes(origin.replace(/\/+$/, ''));
}

// Shape accepted by both Express's `cors` package and Socket.IO's `cors` option.
// Evaluated per request (not at import time), so values from .env loaded by
// ConfigModule are always visible.
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    callback(null, isOriginAllowed(origin));
  },
  credentials: true,
};
