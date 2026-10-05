import { PLAN_CATALOG, PlanVersion, currentPlan, planVersion, priceIdFor, publicCatalog, resolvePriceId } from './plans';

const ENV = {
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_m',
  STRIPE_PRICE_PLUS_ANNUAL: 'price_plus_y',
  STRIPE_PRICE_PREMIUM_MONTHLY: 'price_prem_m',
  STRIPE_PRICE_PREMIUM_ANNUAL: 'price_prem_y',
};

describe('plan catalog', () => {
  it('has exactly one current version of each plan', () => {
    for (const code of ['FREE', 'PLUS', 'PREMIUM'] as const) {
      expect(PLAN_CATALOG.filter((p) => p.code === code && p.current)).toHaveLength(1);
    }
  });

  it('never has two entries with the same code and version', () => {
    const keys = PLAN_CATALOG.map((p) => `${p.code}@${p.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('higher plans never unlock less than lower ones', () => {
    const [free, plus, premium] = (['FREE', 'PLUS', 'PREMIUM'] as const).map((c) => currentPlan(c).entitlements);
    for (const [lo, hi] of [[free, plus], [plus, premium]]) {
      expect(hi.analysisMaxDepth).toBeGreaterThanOrEqual(lo.analysisMaxDepth);
      expect(hi.maxClubsOwned).toBeGreaterThanOrEqual(lo.maxClubsOwned);
      expect(hi.maxAiDifficulty).toBeGreaterThanOrEqual(lo.maxAiDifficulty);
      if (lo.premiumPuzzles) expect(hi.premiumPuzzles).toBe(true);
      if (lo.fullGameReview) expect(hi.fullGameReview).toBe(true);
      if (lo.hostTournaments) expect(hi.hostTournaments).toBe(true);
    }
  });

  it('Free has no analysis or review access at all — both are paid-only', () => {
    const free = currentPlan('FREE').entitlements;
    expect(free.analysisMaxDepth).toBe(0);
    expect(free.fullGameReview).toBe(false);
  });

  it('maps checkout requests to the current price and prices back to plan + version', () => {
    expect(priceIdFor('PREMIUM', 'annual', ENV)).toBe('price_prem_y');
    expect(priceIdFor('FREE', 'monthly', ENV)).toBeUndefined();
    expect(resolvePriceId('price_plus_m', ENV)).toEqual({ code: 'PLUS', version: 1, interval: 'monthly' });
    expect(resolvePriceId('price_unknown', ENV)).toBeNull();
    expect(resolvePriceId(null, ENV)).toBeNull();
  });

  it('still accepts the Phase 13 env names for Plus (the original single paid tier)', () => {
    const legacy = { STRIPE_PRICE_MONTHLY: 'old_m', STRIPE_PRICE_ANNUAL: 'old_y' };
    expect(priceIdFor('PLUS', 'monthly', legacy)).toBe('old_m');
    expect(resolvePriceId('old_y', legacy)).toEqual({ code: 'PLUS', version: 1, interval: 'annual' });
  });

  it('grandfathers subscribers: an old price keeps resolving to its old version after a new one ships', () => {
    const catalog: PlanVersion[] = [
      ...PLAN_CATALOG.filter((p) => p.code !== 'PREMIUM'),
      { ...currentPlan('PREMIUM'), current: false },
      {
        ...currentPlan('PREMIUM'),
        version: 2,
        current: true,
        entitlements: { ...currentPlan('PREMIUM').entitlements, analysisMaxDepth: 9 },
        priceEnv: { monthly: 'STRIPE_PRICE_PREMIUM_MONTHLY_V2' },
      },
    ];
    const env = { ...ENV, STRIPE_PRICE_PREMIUM_MONTHLY_V2: 'price_prem_m_v2' };
    expect(priceIdFor('PREMIUM', 'monthly', env, catalog)).toBe('price_prem_m_v2'); // new checkouts
    expect(resolvePriceId('price_prem_m', env, catalog)).toEqual({ code: 'PREMIUM', version: 1, interval: 'monthly' }); // renewals
    expect(planVersion('PREMIUM', 1, catalog).entitlements.analysisMaxDepth).toBe(8);
    expect(planVersion('PREMIUM', 2, catalog).entitlements.analysisMaxDepth).toBe(9);
    expect(planVersion('PREMIUM', 99, catalog).version).toBe(2); // unknown → current
  });

  it('public catalog exposes no price IDs, only whether each interval can be bought (and a cosmetic display price)', () => {
    const pub = publicCatalog({ STRIPE_PRICE_PREMIUM_MONTHLY: 'price_prem_m' });
    expect(JSON.stringify(pub)).not.toContain('price_prem_m');
    const premium = pub.find((p) => p.code === 'PREMIUM')!;
    expect(premium.purchasable).toEqual({ monthly: true, annual: false });
    expect(premium.displayPrice).toEqual({ monthly: '$4.99', annual: '$49.99' });
  });
});