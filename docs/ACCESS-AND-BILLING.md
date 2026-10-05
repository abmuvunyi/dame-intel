# Access, plans, trials, versioning and audit

How Dame Intel decides who can do what. Everything here is enforced on the backend;
the frontend only mirrors it.

## Two separate ideas: roles and plans

| | **Staff roles** | **Plans** |
|---|---|---|
| What it unlocks | Staff tools (moderation, tournaments, puzzles, admin) | Player features (analysis depth, premium puzzles, …) |
| Who has it | A few trusted people | Every player: Free, Plus or Premium |
| How it's granted | An admin (Admin page or CLI) | Stripe subscription, or the free trial |
| Code | `backend/src/access/roles.ts` | `backend/src/billing/plans.ts`, `billing/access.ts` |

A person can be both, e.g. a Premium subscriber who is also a Moderator.

## Staff roles

| Role | Can do |
|---|---|
| **Admin** | Everything, including granting/revoking roles and reading the audit trail |
| **Moderator** | Anti-cheat queue: dismiss, warn, rating reset, temporary/permanent ban; look up players |
| **Organizer** | Create, open and start any tournament |
| **Content editor** | Review, approve, reject, generate and mark puzzles premium |

- Players have no role. Roles are stored per user and a user can hold several.
- Permissions (not roles) are checked on each route: `@RequirePermissions(PERMISSIONS.X)`.
- Roles are read from the database on every request, and **changing someone's roles or
  banning them signs them out everywhere immediately** (token version bump).
- Grant roles: Admin page → *Staff & roles*, or
  `npm run admin:grant -- <username> [ADMIN|MODERATOR|ORGANIZER|CONTENT_EDITOR] [--revoke]`.
  `ADMIN_USERNAMES` promotes listed users to Admin at boot (promote-only).
- The last Admin cannot be removed through the API.

## Plans

Defaults below are starting values. **Adjust them in `billing/plans.ts` before the first
real subscriber**; after that, add a new version instead (see *Plan versioning*).

| | Free | Plus | Premium |
|---|---|---|---|
| Price | $0 | $1.99/mo ($19.99/yr) | $4.99/mo ($49.99/yr) |
| Analysis depth | none | 6 | 8 |
| Game review (accuracy, classifications, best continuations) | – | ✓ | ✓ |
| Premium puzzles | – | ✓ | ✓ |
| Highest AI difficulty | 4 | 6 | 7 |
| Clubs you can create | 1 | 3 | 10 |
| Host your own tournaments | – | – | ✓ (planned, not yet built) |
| Billing | – | monthly / annual | monthly / annual |

- Free gets zero engine analysis and zero game review — not a reduced depth, no access
  at all. Both are refused outright (`403`/`LOCKED`) rather than run at a token depth.
- AI difficulty levels above a plan's ceiling are shown in the UI (locked, not hidden)
  and enforced server-side in `game.gateway.ts`'s `handlePlayVsAi` — the client-side
  lock is cosmetic only.
- Effective access = the higher of an active paid subscription and an active trial,
  otherwise Free (`billing/access.ts`). `PAST_DUE` keeps access during Stripe's retries.
- Plan changes (upgrade, downgrade, monthly ↔ annual, cancel) happen in Stripe's billing
  portal; the webhook updates the account. One subscription per account.
- Premium's tournament-organizing and local-competition features are reserved for a
  later pass — the entitlement scaffolding (`hostTournaments`) already exists, but
  nothing in the product builds on it yet.

## Free trial

- **7 days, no card, once per account** (`TRIALS_ENABLED`, `TRIAL_DAYS`, `TRIAL_PLAN`).
  `TRIAL_PLAN` defaults to Plus, the entry-level paid plan.
- Starts from the Membership page (`POST /api/v1/subscriptions/trial`).
- Ends by time alone: no background job is needed for access to stop. An hourly job
  sends "ends tomorrow" and "has ended" notifications.
- Refused if the account already used a trial or has a paid subscription.
- Known limitation: someone can create a new account for another trial. If that becomes
  a problem, require a verified email (or phone) before starting a trial.

## Plan versioning (grandfathering)

Every subscriber is stored with the plan **and version** they bought, and entitlements
are looked up by (plan, version). Changing prices or features later never silently
changes an existing member's deal.

To change a paid plan:

1. Create the new Prices in Stripe.
2. In `billing/plans.ts`, set the old entry's `current: false` and add a new entry with
   `version: n + 1`, `current: true` and new env names (e.g. `STRIPE_PRICE_PREMIUM_MONTHLY_V2`).
   Never edit or delete an entry that has subscribers.
3. Set the new env vars **and keep the old ones**, so renewals on old prices still map
   to their version.

New checkouts use the current version. If Stripe ever reports a price the catalog
doesn't know, the member keeps access (the entry-level paid plan, Plus — never silently
upgraded to Premium), and an error plus a `subscription.unknown_price` audit event flag
the misconfiguration.

## API versioning

- All HTTP endpoints are under **`/api/v1/...`**. Health checks stay at `/health` and
  `/health/live`. The Stripe webhook URL is `https://<api-host>/api/v1/subscriptions/webhook`.
- Adding fields or new endpoints doesn't change the version.
- A breaking change (removing or renaming a field or route, changing its meaning) ships as `/api/v2` next
  to v1 (`@Controller({ path, version: '2' })`), and v1 keeps working for a
  deprecation window (suggested: 6 months, longer once mobile apps exist).
- The frontend's version lives in one place: `frontend/src/lib/api.ts` (`API_VERSION`).
- The live-game WebSocket (Socket.IO) is not path-versioned; keep its events
  backward compatible, or add new event names.

## Audit trail

Append-only table `audit_log`: when, who (user / system / Stripe / CLI), action,
target, details, IP and request id. Admins read it on the Admin page
(`GET /api/v1/admin/audit`). No API can edit or delete entries. Anything that looks like a secret (passwords, tokens, card data) is replaced with `[redacted]` before it's stored.

| Action | When |
|---|---|
| `roles.changed` | Any role grant/revoke (API, CLI or `ADMIN_USERNAMES`) |
| `moderation.action` | A moderator's decision on an anti-cheat flag (incl. bans) |
| `auth.registered`, `auth.login_failed`, `auth.login_blocked_banned` | Account security |
| `trial.started`, `trial.ended` | Free trials |
| `subscription.checkout_started`, `subscription.changed`, `subscription.unknown_price` | Payments |
| `tournament.created`, `tournament.registration_opened`, `tournament.started` | Tournaments |
| `puzzle.approved`, `puzzle.rejected`, `puzzle.premium_changed` | Puzzle curation |

Retention: keep at least 12 months. Archive or delete older rows with a scheduled
database job if the table grows large.

## Database portability

PostgreSQL 13–18 is supported and tested in CI on every push. It runs on any managed
Postgres, e.g. AWS RDS/Aurora, Google Cloud SQL, Azure, DigitalOcean, Render, Railway,
Fly, Heroku, Supabase, Neon or Aiven. Configure it with `DATABASE_URL` or with
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`; set TLS with `DB_SSL` or `?sslmode=` in the URL. Only portable
SQL types are used and no extensions are needed, so moving providers is a
`pg_dump` / `pg_restore`. If the provider offers a connection pooler (PgBouncer,
Supabase/Neon "pooled" URLs), the app works through it; if migrations misbehave through
a pooler, run them once with the direct URL (`npm run migration:run`).
