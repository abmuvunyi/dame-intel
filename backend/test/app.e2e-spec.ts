// Boots the REAL AppModule with the REAL production HTTP pipeline (configureApp:
// /api/v1 versioning, helmet, CORS allowlist, validation, throttling, auth, roles &
// permissions, plans & trials, audit trail) against an in-memory sqlite database.
process.env.SQLITE_PATH = ':memory:';
process.env.PUZZLE_SEED_ON_BOOT = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.LOG_FORMAT = 'json';
process.env.JWT_SECRET = 'e2e-test-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGINS = 'https://play.example.com';
process.env.ADMIN_USERNAMES = '';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { UsersService } from './../src/users/users.service';

const V1 = '/api/v1';

describe('Production HTTP pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    users = app.get(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  const PASSWORD = 'correct-horse-battery';
  // Each simulated player signs in from their own IP (the app trusts one proxy hop),
  // so the per-IP auth rate limits don't interfere with the functional tests.
  let ipCounter = 1;
  const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;
  const register = (username: string) =>
    request(server()).post(`${V1}/auth/register`).set('X-Forwarded-For', nextIp()).send({ username, password: PASSWORD });
  const login = async (username: string) =>
    (await request(server()).post(`${V1}/auth/login`).set('X-Forwarded-For', nextIp()).send({ username, password: PASSWORD }).expect(201)).body.access_token as string;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const makeStaff = async (username: string, roles: string[]) => {
    await register(username).expect(201);
    const u = await users.findOneByUsername(username);
    await users.setRoles(u!.id, roles);
    return login(username); // role changes revoke old sessions, so sign in again
  };

  describe('infrastructure', () => {
    it('GET /health (unversioned) reports the database as up', async () => {
      const res = await request(server()).get('/health').expect(200);
      expect(res.body.checks.database).toBe('up');
    });

    it('API routes live under /api/v1; unversioned API paths do not exist', async () => {
      await request(server()).get(`${V1}/subscriptions/plans`).expect(200);
      await request(server()).get('/subscriptions/plans').expect(404);
    });

    it('sets security headers (helmet) and a request id', async () => {
      const res = await request(server()).get('/health/live').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('CORS: allows the configured frontend origin and refuses others', async () => {
      const ok = await request(server()).get('/health/live').set('Origin', 'https://play.example.com');
      expect(ok.headers['access-control-allow-origin']).toBe('https://play.example.com');
      const bad = await request(server()).get('/health/live').set('Origin', 'https://evil.example');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('accounts', () => {
    it('rejects an invalid registration with 400 and a readable message', async () => {
      const res = await request(server()).post(`${V1}/auth/register`).send({ username: 'a', password: 'short' }).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/Username must be|at least 8/);
    });

    it('a new account is a Free player with no staff roles, and the profile leaks no secrets', async () => {
      await register('alice').expect(201);
      const tok_alice = await login('alice');
      const profile = await request(server()).get(`${V1}/auth/profile`).set(bearer(tok_alice)).expect(200);
      expect(profile.body).toMatchObject({ roles: [], permissions: [], plan: 'FREE', planSource: 'FREE' });
      expect(profile.body.trial).toMatchObject({ active: false, used: false });
      expect(profile.body.passwordHash).toBeUndefined();
      expect(profile.body.stripeCustomerId).toBeUndefined();
    });

    it('"log out everywhere" revokes every existing token', async () => {
      await register('logout_me').expect(201);
      const t1 = await login('logout_me');
      await request(server()).post(`${V1}/auth/logout-all`).set(bearer(t1)).expect(201);
      await request(server()).get(`${V1}/auth/profile`).set(bearer(t1)).expect(401);
      const tok_logout_me = await login('logout_me');
      await request(server()).get(`${V1}/auth/profile`).set(bearer(tok_logout_me)).expect(200);
    });
  });

  describe('roles & permissions', () => {
    it('each staff role reaches only its own tools', async () => {
      const player = (await register('player1')).body.access_token;
      const moderator = await makeStaff('mod1', ['MODERATOR']);
      const organizer = await makeStaff('org1', ['ORGANIZER']);
      const editor = await makeStaff('editor1', ['CONTENT_EDITOR']);

      // Anti-cheat queue: moderators only
      await request(server()).get(`${V1}/anticheat/admin/flags`).expect(401);
      await request(server()).get(`${V1}/anticheat/admin/flags`).set(bearer(player)).expect(403);
      await request(server()).get(`${V1}/anticheat/admin/flags`).set(bearer(organizer)).expect(403);
      await request(server()).get(`${V1}/anticheat/admin/flags`).set(bearer(moderator)).expect(200);

      // Puzzle management: content editors only
      await request(server()).get(`${V1}/puzzles/admin/pending`).set(bearer(moderator)).expect(403);
      await request(server()).get(`${V1}/puzzles/admin/pending`).set(bearer(editor)).expect(200);

      // Tournaments: organizers (or Pro players — see plans below)
      const body = { name: 'Kigali Open', format: 'Swiss' };
      await request(server()).post(`${V1}/tournaments`).set(bearer(player)).send(body).expect(403);
      await request(server()).post(`${V1}/tournaments`).set(bearer(editor)).send(body).expect(403);
      await request(server()).post(`${V1}/tournaments`).set(bearer(organizer)).send(body).expect(201);
      await request(server()).post(`${V1}/tournaments`).set(bearer(organizer)).send({ ...body, boardSize: 12 }).expect(400);

      // Role management and audit: admins only
      await request(server()).get(`${V1}/admin/audit`).set(bearer(moderator)).expect(403);
      await request(server()).put(`${V1}/admin/users/1/roles`).set(bearer(moderator)).send({ roles: ['ADMIN'] }).expect(403);
    });

    it('an admin grants and revokes roles via the API; the change is immediate and audited', async () => {
      const admin = await makeStaff('admin1', ['ADMIN']);
      await register('newmod').expect(201);
      const target = await users.findOneByUsername('newmod');
      const oldToken = await login('newmod');

      const res = await request(server())
        .put(`${V1}/admin/users/${target!.id}/roles`).set(bearer(admin))
        .send({ roles: ['MODERATOR'], reason: 'volunteer moderator' }).expect(200);
      expect(res.body.roles).toEqual(['MODERATOR']);

      await request(server()).get(`${V1}/auth/profile`).set(bearer(oldToken)).expect(401); // old session revoked
      const fresh = await login('newmod');
      await request(server()).get(`${V1}/anticheat/admin/flags`).set(bearer(fresh)).expect(200);

      await request(server()).put(`${V1}/admin/users/${target!.id}/roles`).set(bearer(admin)).send({ roles: [] }).expect(200);
      const tok_newmod = await login('newmod');
      await request(server()).get(`${V1}/anticheat/admin/flags`).set(bearer(tok_newmod)).expect(403);

      const audit = await request(server()).get(`${V1}/admin/audit`).query({ action: 'roles.changed', targetId: String(target!.id) }).set(bearer(admin)).expect(200);
      expect(audit.body.total).toBe(2);
      expect(audit.body.items[1]).toMatchObject({ actorType: 'USER', details: { before: [], after: ['MODERATOR'], reason: 'volunteer moderator' } });
    });

    it('rejects unknown roles and refuses to remove the last administrator', async () => {
      const admin = await makeStaff('solo_admin', ['ADMIN']);
      const me = await users.findOneByUsername('solo_admin');
      await request(server()).put(`${V1}/admin/users/${me!.id}/roles`).set(bearer(admin)).send({ roles: ['SUPERUSER'] }).expect(400);
      // admin1 (previous test) and solo_admin exist → allowed; demote admin1 first so solo_admin is last
      const other = await users.findOneByUsername('admin1');
      await users.setRoles(other!.id, []);
      await request(server()).put(`${V1}/admin/users/${me!.id}/roles`).set(bearer(admin)).send({ roles: ['MODERATOR'] }).expect(400);
    });
  });

  describe('plans, trials & entitlements', () => {
    it('lists the Free / Premium / Pro catalog and the trial offer without exposing price IDs', async () => {
      const res = await request(server()).get(`${V1}/subscriptions/plans`).expect(200);
      expect(res.body.plans.map((p: any) => p.code)).toEqual(['FREE', 'PREMIUM', 'PRO']);
      expect(res.body.trial).toEqual({ enabled: true, days: 7, plan: 'PREMIUM' });
      expect(JSON.stringify(res.body)).not.toMatch(/price_/);
    });

    it('7-day trial: no card, unlocks Premium immediately, only once, and is audited', async () => {
      await register('trialist').expect(201);
      const token = await login('trialist');
      const before = await request(server()).get(`${V1}/subscriptions/me`).set(bearer(token)).expect(200);
      expect(before.body).toMatchObject({ plan: 'FREE', trial: { available: true } });

      const started = await request(server()).post(`${V1}/subscriptions/trial`).set(bearer(token)).expect(201);
      expect(started.body).toMatchObject({ plan: 'PREMIUM', source: 'TRIAL' });
      const days = (new Date(started.body.trial.endsAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);

      const after = await request(server()).get(`${V1}/subscriptions/me`).set(bearer(token)).expect(200);
      expect(after.body).toMatchObject({ plan: 'PREMIUM', source: 'TRIAL', entitlements: { premiumPuzzles: true, analysisMaxDepth: 6 } });
      expect(after.body.trial.available).toBe(false);

      await request(server()).post(`${V1}/subscriptions/trial`).set(bearer(token)).expect(409);

      const admin = await makeStaff('auditor', ['ADMIN']);
      const me = await users.findOneByUsername('trialist');
      const audit = await request(server()).get(`${V1}/admin/audit`).query({ action: 'trial.started', targetId: String(me!.id) }).set(bearer(admin)).expect(200);
      expect(audit.body.total).toBe(1);
    });

    it('analysis depth follows the plan: guest 4, Pro 8', async () => {
      const board = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) =>
        (r + c) % 2 === 1 && r < 3 ? { color: 'D', type: 'MAN' } : (r + c) % 2 === 1 && r > 4 ? { color: 'L', type: 'MAN' } : null));
      const guest = await request(server()).post(`${V1}/analysis`).send({ board, turn: 'L', depth: 1 }).expect(201);
      expect(guest.body.maxDepth).toBe(4);

      await register('pro_player').expect(201);
      const pro = await users.findOneByUsername('pro_player');
      await users.applyMembershipUpdate(pro!.id, { tier: 'PRO', status: 'ACTIVE', stripeSubscriptionId: 'sub_e2e', renewsAt: null, planVersion: 1 });
      const tok_pro_player = await login('pro_player');
      const res = await request(server()).post(`${V1}/analysis`).set(bearer(tok_pro_player)).send({ board, turn: 'L', depth: 1 }).expect(201);
      expect(res.body.maxDepth).toBe(8);
    });

    it('Pro players can host their own tournaments and manage only those', async () => {
      const proToken = await login('pro_player');
      const created = await request(server()).post(`${V1}/tournaments`).set(bearer(proToken)).send({ name: 'Pro Club Swiss', format: 'Swiss' }).expect(201);
      await request(server()).post(`${V1}/tournaments/${created.body.id}/open-registration`).set(bearer(proToken)).expect(201);

      const organizer = await login('org1');
      const staffEvent = await request(server()).post(`${V1}/tournaments`).set(bearer(organizer)).send({ name: 'Staff Swiss', format: 'Swiss' }).expect(201);
      await request(server()).post(`${V1}/tournaments/${staffEvent.body.id}/open-registration`).set(bearer(proToken)).expect(403);
    });

    it('club creation is limited by plan (Free: 1)', async () => {
      await register('clubber').expect(201);
      const token = await login('clubber');
      await request(server()).post(`${V1}/clubs`).set(bearer(token)).send({ name: 'Club One' }).expect(201);
      const second = await request(server()).post(`${V1}/clubs`).set(bearer(token)).send({ name: 'Club Two' }).expect(403);
      expect(second.body.message).toMatch(/Upgrade/);
    });
  });

  describe('abuse protection', () => {
    it('rate-limits repeated login attempts, and failed logins are audited', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(server()).post(`${V1}/auth/login`).set('X-Forwarded-For', '203.0.113.77').send({ username: 'nobody', password: 'wrong-password' });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
      const admin = await login('auditor');
      const audit = await request(server()).get(`${V1}/admin/audit`).query({ action: 'auth.login_failed' }).set(bearer(admin)).expect(200);
      expect(audit.body.total).toBeGreaterThanOrEqual(10);
      expect(audit.body.items[0]).toMatchObject({ ip: '203.0.113.77', details: { username: 'nobody' } });
      expect(JSON.stringify(audit.body)).not.toContain('wrong-password');
    });

    it('rejects a malformed analysis board instead of running the engine on it', async () => {
      await request(server()).post(`${V1}/analysis`).send({ board: Array.from({ length: 50 }, () => []), turn: 'L', depth: 4 }).expect(400);
    });
  });
});
