import { allowedOrigins, isOriginAllowed } from './cors';

describe('CORS allowlist (Phase 14)', () => {
  it('defaults to the local Next.js dev server outside production', () => {
    expect(isOriginAllowed('http://localhost:3000', {} as any)).toBe(true);
    expect(isOriginAllowed('https://evil.example', {} as any)).toBe(false);
  });

  it('allows nothing cross-origin in production unless configured', () => {
    expect(allowedOrigins({ NODE_ENV: 'production' } as any)).toEqual([]);
    expect(isOriginAllowed('http://localhost:3000', { NODE_ENV: 'production' } as any)).toBe(false);
  });

  it('matches configured origins exactly, ignoring trailing slashes and whitespace', () => {
    const env = { CORS_ORIGINS: ' https://play.example.com/ , https://www.example.com' } as any;
    expect(isOriginAllowed('https://play.example.com', env)).toBe(true);
    expect(isOriginAllowed('https://www.example.com/', env)).toBe(true);
    expect(isOriginAllowed('https://play.example.com.evil.io', env)).toBe(false);
    expect(isOriginAllowed('http://play.example.com', env)).toBe(false);
  });

  it('lets requests without an Origin header through (server-to-server, health checks, webhooks)', () => {
    expect(isOriginAllowed(undefined, { NODE_ENV: 'production' } as any)).toBe(true);
  });
});
