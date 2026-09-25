// The plan catalog: what each plan unlocks, and which Stripe prices belong to which
// plan VERSION. Pure module (no framework imports).
//
// ── How versioning works ─────────────────────────────────────────────────────────
// Every subscriber is recorded with the plan code AND version they bought
// (User.membershipTier + User.planVersion). Entitlements are always looked up by
// (code, version), so changing a plan's price or contents later never silently
// changes what existing subscribers get ("grandfathering").
//
// To change a paid plan (new price or new features):
//   1. Create new Price objects in Stripe.
//   2. Add a NEW entry below with version + 1 and `current: true`; set the old entry's
//      `current` to false. NEVER edit or delete an entry people are subscribed to.
//   3. Point the new entry's priceEnv at new env vars (e.g. STRIPE_PRICE_PRO_MONTHLY_V2)
//      and keep the old env vars set, so renewals on old prices still resolve.
// New checkouts always use the current version; renewals keep their version.
//
// FREE has no price. Its version only matters for documentation/auditing — free
// users always get the current FREE entitlements.

export const PLAN_CODES = ['FREE', 'PREMIUM', 'PRO'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingInterval = 'monthly' | 'annual';

export interface Entitlements {
  /** Access to puzzles marked premium-only. */
  premiumPuzzles: boolean;
  /** Maximum engine depth for the analysis board (/analysis). */
  analysisMaxDepth: number;
  /** Game review includes the engine's "best continuation" and "how this gets punished" lines. */
  fullGameReview: boolean;
  /** How many clubs the player may create. */
  maxClubsOwned: number;
  /** May create and run their own tournaments (staff organizers can always). */
  hostTournaments: boolean;
}

export interface PlanVersion {
  code: PlanCode;
  version: number;
  name: string;
  tagline: string;
  /** Only one version per code is current: the one new checkouts and trials use. */
  current: boolean;
  entitlements: Entitlements;
  /** Env var names holding this version's Stripe price IDs (paid plans only). */
  priceEnv?: Partial<Record<BillingInterval, string>>;
}

// NOTE (product decision): the limits below are sensible starting defaults, not
// final pricing. Adjust them BEFORE the first real subscriber; after that, add a
// new version instead of editing.
export const PLAN_CATALOG: readonly PlanVersion[] = [
  {
    code: 'FREE',
    version: 1,
    name: 'Free',
    tagline: 'Play, learn and solve puzzles.',
    current: true,
    entitlements: { premiumPuzzles: false, analysisMaxDepth: 4, fullGameReview: false, maxClubsOwned: 1, hostTournaments: false },
  },
  {
    code: 'PREMIUM',
    version: 1,
    name: 'Premium',
    tagline: 'Every puzzle, deeper analysis and full game reviews.',
    current: true,
    entitlements: { premiumPuzzles: true, analysisMaxDepth: 6, fullGameReview: true, maxClubsOwned: 3, hostTournaments: false },
    priceEnv: { monthly: 'STRIPE_PRICE_PREMIUM_MONTHLY', annual: 'STRIPE_PRICE_PREMIUM_ANNUAL' },
  },
  {
    code: 'PRO',
    version: 1,
    name: 'Pro',
    tagline: 'Maximum analysis depth, host your own tournaments, run more clubs.',
    current: true,
    entitlements: { premiumPuzzles: true, analysisMaxDepth: 8, fullGameReview: true, maxClubsOwned: 10, hostTournaments: true },
    priceEnv: { monthly: 'STRIPE_PRICE_PRO_MONTHLY', annual: 'STRIPE_PRICE_PRO_ANNUAL' },
  },
];

const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, PREMIUM: 1, PRO: 2 };

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value);
}

export function planRank(code: PlanCode): number {
  return PLAN_RANK[code];
}

export function currentPlan(code: PlanCode, catalog: readonly PlanVersion[] = PLAN_CATALOG): PlanVersion {
  const plan = catalog.find((p) => p.code === code && p.current);
  if (!plan) throw new Error(`Plan catalog has no current version of ${code}`);
  return plan;
}

/** The exact version a subscriber is on; falls back to the current version if unknown. */
export function planVersion(code: PlanCode, version: number | null | undefined, catalog: readonly PlanVersion[] = PLAN_CATALOG): PlanVersion {
  return catalog.find((p) => p.code === code && p.version === version) ?? currentPlan(code, catalog);
}

// Legacy env names from Phase 13 (single paid tier) keep working for Premium v1.
const LEGACY_PRICE_ENV: Record<string, string> = {
  STRIPE_PRICE_PREMIUM_MONTHLY: 'STRIPE_PRICE_MONTHLY',
  STRIPE_PRICE_PREMIUM_ANNUAL: 'STRIPE_PRICE_ANNUAL',
};

function readPriceEnv(envName: string, env: Record<string, string | undefined>): string | undefined {
  return env[envName] || (LEGACY_PRICE_ENV[envName] ? env[LEGACY_PRICE_ENV[envName]] : undefined) || undefined;
}

/** Stripe price ID for a NEW checkout (current version only). */
export function priceIdFor(
  code: PlanCode,
  interval: BillingInterval,
  env: Record<string, string | undefined> = process.env,
  catalog: readonly PlanVersion[] = PLAN_CATALOG,
): string | undefined {
  const plan = currentPlan(code, catalog);
  const envName = plan.priceEnv?.[interval];
  return envName ? readPriceEnv(envName, env) : undefined;
}

/** Which plan + version + interval a Stripe price belongs to (any version, current or legacy). */
export function resolvePriceId(
  priceId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
  catalog: readonly PlanVersion[] = PLAN_CATALOG,
): { code: PlanCode; version: number; interval: BillingInterval } | null {
  if (!priceId) return null;
  for (const plan of catalog) {
    for (const [interval, envName] of Object.entries(plan.priceEnv ?? {}) as [BillingInterval, string][]) {
      if (readPriceEnv(envName, env) === priceId) return { code: plan.code, version: plan.version, interval };
    }
  }
  return null;
}

/** Every env var a fully configured paid catalog needs (for config validation). */
export function requiredPriceEnvNames(catalog: readonly PlanVersion[] = PLAN_CATALOG): string[] {
  return catalog.filter((p) => p.current).flatMap((p) => Object.values(p.priceEnv ?? {}));
}

/** Public, client-safe view of the current catalog (no price IDs). */
export function publicCatalog(env: Record<string, string | undefined> = process.env, catalog: readonly PlanVersion[] = PLAN_CATALOG) {
  return catalog
    .filter((p) => p.current)
    .map((p) => ({
      code: p.code,
      version: p.version,
      name: p.name,
      tagline: p.tagline,
      entitlements: p.entitlements,
      purchasable: {
        monthly: !!(p.priceEnv?.monthly && readPriceEnv(p.priceEnv.monthly, env)),
        annual: !!(p.priceEnv?.annual && readPriceEnv(p.priceEnv.annual, env)),
      },
    }));
}
