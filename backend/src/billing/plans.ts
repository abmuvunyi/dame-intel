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
//   3. Point the new entry's priceEnv at new env vars (e.g. STRIPE_PRICE_PREMIUM_MONTHLY_V2)
//      and keep the old env vars set, so renewals on old prices still resolve.
// New checkouts always use the current version; renewals keep their version.
//
// FREE has no price. Its version only matters for documentation/auditing — free
// users always get the current FREE entitlements.
//
// Naming (2026-09, product decision): the three plan codes ARE their display names —
// FREE / PLUS / PREMIUM — no separate internal-vs-marketing naming split. Earlier in
// this phase the codes were PREMIUM/PRO with "Plus"/"Premium" as just a display
// label on top, which read as a mismatch the moment you opened this file (PREMIUM
// the code showing as "Plus" the product). Renamed everywhere instead: PLAN_CODES,
// every User.membershipTier value ever written, Stripe price env var names, the
// checkout DTO, trial defaults. Safe to do as a real rename rather than an additive
// migration because there are no real subscribers yet (see STATUS.md) — nothing to
// grandfather.

export const PLAN_CODES = ['FREE', 'PLUS', 'PREMIUM'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingInterval = 'monthly' | 'annual';

export interface Entitlements {
  /** Access to puzzles marked premium-only. */
  premiumPuzzles: boolean;
  /**
   * Maximum engine depth for the analysis board (/analysis). 0 means no access at
   * all — the analysis endpoint refuses the request outright rather than silently
   * running a trivial depth-0 search (see analysis.controller.ts).
   */
  analysisMaxDepth: number;
  /**
   * Any post-game review at all — classifications, accuracy, and the eval bar, not
   * just the "best continuation"/"how this gets punished" lines. False means the
   * review endpoint reports the game as LOCKED rather than returning review data
   * (see game-review.controller.ts). Product decision (2026-09): review used to be
   * free for everyone; Free now gets none of it, matching analysis access.
   */
  fullGameReview: boolean;
  /** How many clubs the player may create. */
  maxClubsOwned: number;
  /** May create and run their own tournaments (staff organizers can always). */
  hostTournaments: boolean;
  /**
   * Highest AI difficulty level (1-7, see ai.service.ts's DIFFICULTY_MAX_DEPTH /
   * DIFFICULTY_TIME_BUDGET_MS) this plan may start a game against. Every level is
   * always shown in the UI — this only gates whether starting a game at it succeeds,
   * matching the product decision to show locked levels rather than hide them.
   */
  maxAiDifficulty: number;
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
  /**
   * A static, cosmetic price label shown on the pricing page BEFORE a real Stripe
   * price is looked up (or if that lookup fails) — see
   * SubscriptionsController.getPlans(), which prefers the real Stripe amount
   * whenever priceEnv resolves to a configured price and only falls back to this.
   * Not billing-authoritative: the actual charge is whatever the Stripe Price object
   * says, always. Keep this in sync with Stripe by hand when the real price changes.
   */
  displayPrice?: Partial<Record<BillingInterval, string>>;
}

// NOTE (product decision, 2026-09): pricing confirmed — Free $0, Plus $1.99/mo,
// Premium $4.99/mo. Annual prices aren't a decision that's been made yet; the
// figures below are a placeholder ~17% ("2 months free") discount, the common SaaS
// convention, not a confirmed number — adjust in Stripe and here before launch.
// Premium's own further build-out (tournament organizing beyond hostTournaments,
// and a "local competition" feature) is intentionally NOT part of this pass — noted
// here as a real product commitment for later, not forgotten, not yet built.
export const PLAN_CATALOG: readonly PlanVersion[] = [
  {
    code: 'FREE',
    version: 1,
    name: 'Free',
    tagline: 'Play, learn and solve puzzles.',
    current: true,
    entitlements: { premiumPuzzles: false, analysisMaxDepth: 0, fullGameReview: false, maxClubsOwned: 1, hostTournaments: false, maxAiDifficulty: 4 },
  },
  {
    code: 'PLUS',
    version: 1,
    name: 'Plus',
    tagline: 'Every puzzle, real game review, and analysis up to depth 6.',
    current: true,
    entitlements: { premiumPuzzles: true, analysisMaxDepth: 6, fullGameReview: true, maxClubsOwned: 3, hostTournaments: false, maxAiDifficulty: 6 },
    priceEnv: { monthly: 'STRIPE_PRICE_PLUS_MONTHLY', annual: 'STRIPE_PRICE_PLUS_ANNUAL' },
    displayPrice: { monthly: '$1.99', annual: '$19.99' },
  },
  {
    code: 'PREMIUM',
    version: 1,
    name: 'Premium',
    tagline: 'Maximum analysis depth, the toughest bots unlocked, host your own tournaments.',
    current: true,
    entitlements: { premiumPuzzles: true, analysisMaxDepth: 8, fullGameReview: true, maxClubsOwned: 10, hostTournaments: true, maxAiDifficulty: 7 },
    priceEnv: { monthly: 'STRIPE_PRICE_PREMIUM_MONTHLY', annual: 'STRIPE_PRICE_PREMIUM_ANNUAL' },
    displayPrice: { monthly: '$4.99', annual: '$49.99' },
  },
];

const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, PLUS: 1, PREMIUM: 2 };

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

// Legacy env names from Phase 13 (a single paid tier, back when it was also called
// "Premium" — today's Plus) keep working for Plus v1, so a server whose operator
// only ever set the original unsuffixed names doesn't lose its price config over a
// pure renaming pass.
const LEGACY_PRICE_ENV: Record<string, string> = {
  STRIPE_PRICE_PLUS_MONTHLY: 'STRIPE_PRICE_MONTHLY',
  STRIPE_PRICE_PLUS_ANNUAL: 'STRIPE_PRICE_ANNUAL',
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
      // Cosmetic only — see PlanVersion.displayPrice's own doc comment.
      // SubscriptionsController.getPlans() overrides this with the real Stripe
      // amount when a price is actually configured; this is what shows before that.
      displayPrice: p.displayPrice ?? null,
      purchasable: {
        monthly: !!(p.priceEnv?.monthly && readPriceEnv(p.priceEnv.monthly, env)),
        annual: !!(p.priceEnv?.annual && readPriceEnv(p.priceEnv.annual, env)),
      },
    }));
}
