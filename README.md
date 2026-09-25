# Dame Intel — Online Draughts Platform

A real-time multiplayer draughts platform (International 10x10 first, American 8x8 second)
aiming at chess.com-level features: live PvP with server clocks, AI opponents, Glicko-2
ratings, puzzles and Puzzle Storm, Swiss tournaments, spectating, friends/clubs/chat,
automated game review, anti-cheat with a moderator queue, lessons, and Stripe memberships.

See **STATUS.md** for the verified, per-module state of the project, and
**docs/ACCESS-AND-BILLING.md** for staff roles, plans (Free / Premium / Pro), the free
trial, plan and API versioning, and the audit trail.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind 4, Socket.IO client
- **Backend:** NestJS 11, Socket.IO, TypeORM, engine searches on worker threads
- **Data:** PostgreSQL 13–18 on any managed provider (migrations) / sqlite (local dev only), optional Redis
- **API:** REST under `/api/v1`, plus Socket.IO for live games
- **Node:** 22 LTS (20.11+ works)

## Local development

```bash
# 1. (optional) Postgres + Redis — without them the backend uses sqlite + in-memory
docker compose up -d

# 2. Backend  → http://localhost:3001
cd backend
cp .env.example .env          # zero config works; see comments in the file
npm install
npm run start:dev

# 3. Frontend → http://localhost:3000
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Make yourself an admin: add your username to `ADMIN_USERNAMES` in `backend/.env` and
restart, or run `npm run build && npm run admin:grant -- <username>` in `backend/`. Then
give other staff their roles (Moderator, Organizer, Content editor) from the **Admin** page.

### Useful scripts (backend)

| Script | What it does |
|---|---|
| `npm test` / `npm run test:e2e` | Unit tests / end-to-end tests of the real HTTP pipeline |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks (both run in CI) |
| `npm run migration:generate -- src/database/migrations/<Name>` | Create a migration after changing an entity (needs `DATABASE_URL`) |
| `npm run migration:run` / `migration:revert` / `migration:show` | Apply / roll back / list migrations |
| `npm run migration:check` | Fails if entities and migrations disagree (runs in CI) |
| `npm run admin:grant -- <username> [ROLE] [--revoke]` | Grant or revoke a staff role (default ADMIN) |
| `npm run loadtest -- --url <backend> --pvp 50 --ai 10` | WebSocket load test (see STATUS.md, Phase 14) |

## Production deployment (cloud-agnostic)

The platform ships as two container images and needs a PostgreSQL database. Any cloud
works: managed containers (Cloud Run, ECS/Fargate, Azure Container Apps, Fly, Render,
Railway, DigitalOcean App Platform), Kubernetes, or a VM with Docker.

| Component | Image / build | Needs |
|---|---|---|
| Backend API + WebSocket | `backend/Dockerfile` (port 3001) | PostgreSQL, env vars below; Redis optional |
| Frontend | `frontend/Dockerfile` (port 3000) | `NEXT_PUBLIC_API_URL` **at build time** |

**Required backend configuration** (the server refuses to start in production without it —
full list with explanations in `backend/.env.example`):
`NODE_ENV=production`, `JWT_SECRET` (≥ 32 random chars), a PostgreSQL database
(`DATABASE_URL`, or `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`),
`CORS_ORIGINS` (the frontend's exact origin), `APP_URL`. Usually also `DB_SSL=true` for
managed Postgres, `ADMIN_USERNAMES`, and — if payments are on — `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` and the four `STRIPE_PRICE_{PREMIUM,PRO}_{MONTHLY,ANNUAL}` values
(webhook URL: `https://<api-host>/api/v1/subscriptions/webhook`), plus the `RESEND_*`
values for email. Store secrets in your platform's secret manager; never commit them.

**Things your hosting setup must provide**

1. **Exactly one backend instance** for now. Live games (boards, clocks, matchmaking
   queue) live in the backend process's memory, so a second replica would split players
   between two independent game servers. Scale up (more CPU), not out. Horizontal scaling
   needs shared game state first (see STATUS.md, Phase 14 → remaining work).
2. **WebSockets** must be allowed through the load balancer / ingress, with an idle
   timeout of at least 60 s.
3. **Health checks:** liveness `GET /health/live`, readiness `GET /health` (checks the DB).
4. **HTTPS** terminated at the load balancer; set `TRUST_PROXY` to the number of proxy hops.
5. **CPU:** AI moves, game review and anti-cheat run on worker threads
   (`AI_WORKERS`, default = CPU cores − 1, max 4). Recommended backend size: 2+ vCPUs,
   2 GB+ RAM (engine search tables are the main memory user).
6. **Database migrations** run automatically on backend start (`DB_MIGRATIONS_RUN=true`).
   Take a database backup before each deploy.

Try the whole production stack on one machine:

```bash
cp backend/.env.example backend/.env.production   # fill in JWT_SECRET, CORS_ORIGINS, APP_URL
POSTGRES_PASSWORD=change-me NEXT_PUBLIC_API_URL=http://localhost:3001 \
  docker compose -f docker-compose.prod.yml up --build
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`: backend lint,
typecheck, unit + e2e tests, build and dependency audit; on **each PostgreSQL version
13–18**: migrations, schema-drift check, rollback, the e2e suite and a production boot;
frontend lint, typecheck, production build and audit; and both Docker image builds. Turn on branch protection for `main` so a red CI blocks
the merge.
