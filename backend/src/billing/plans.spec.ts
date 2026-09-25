import { PLAN_CATALOG, PlanVersion, currentPlan, planVersion, priceIdFor, publicCatalog, resolvePriceId } from './plans';

const ENV = {
  STRIPE_PRICE_PREMIUM_MONTHLY: 'price_prem_m',
  STRIPE_PRICE_PREMIUM_ANNUAL: 'price_prem_y',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_PRO_ANNUAL: 'price_pro_y',
};

describe('plan catalog', () => {
  it('has exactly one current version of each plan', () => {
    for (const code of ['FREE', 'PREMIUM', 'PRO'] as const) {
      expect(PLAN_CATALOG.filter((p) => p.code === code && p.current)).toHaveLength(1);
    }
  });

  it('never has two entries with the same code and version', () => {
    const keys = PLAN_CATALOG.map((p) => `${p.code}@${p.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('higher plans never unlock less than lower ones', () => {
    const [free, premium, pro] = (['FREE', 'PREMIUM', 'PRO'] as const).map((c) => currentPlan(c).entitlements);
    for (const [lo, hi] of [[free, premium], [premium, pro]]) {
      expect(hi.analysisMaxDepth).toBeGreaterThanOrEqual(lo.analysisMaxDepth);
      expect(hi.maxClubsOwned).toBeGreaterThanOrEqual(lo.maxClubsOwned);
      if (lo.premiumPuzzles) expect(hi.premiumPuzzles).toBe(true);
      if (lo.fullGameReview) expect(hi.fullGameReview).toBe(true);
      if (lo.hostTournaments) expect(hi.hostTournaments).toBe(true);
    }
  });

  it('maps checkout requests to the current price and prices back to plan + version', () => {
    expect(priceIdFor('PRO', 'annual', ENV)).toBe('price_pro_y');
    expect(priceIdFor('FREE', 'monthly', ENV)).toBeUndefined();
    expect(resolvePriceId('price_prem_m', ENV)).toEqual({ code: 'PREMIUM', version: 1, interval: 'monthly' });
    expect(resolvePriceId('price_unknown', ENV)).toBeNull();
    expect(resolvePriceId(null, ENV)).toBeNull();
  });

  it('still accepts the Phase 13 env names for Premium', () => {
    const legacy = { STRIPE_PRICE_MONTHLY: 'old_m', STRIPE_PRICE_ANNUAL: 'old_y' };
    expect(priceIdFor('PREMIUM', 'monthly', legacy)).toBe('old_m');
    expect(resolvePriceId('old_y', legacy)).toEqual({ code: 'PREMIUM', version: 1, interval: 'annual' });
  });

  it('grandfathers subscribers: an old price keeps resolving to its old version after a new one ships', () => {
    const catalog: PlanVersion[] = [
      ...PLAN_CATALOG.filter((p) => p.code !== 'PRO'),
      { ...currentPlan('PRO'), current: false },
      {
        ...currentPlan('PRO'),
        version: 2,
        current: true,
        entitlements: { ...currentPlan('PRO').entitlements, analysisMaxDepth: 9 },
        priceEnv: { monthly: 'STRIPE_PRICE_PRO_MONTHLY_V2' },
      },
    ];
    const env = { ...ENV, STRIPE_PRICE_PRO_MONTHLY_V2: 'price_pro_m_v2' };
    expect(priceIdFor('PRO', 'monthly', env, catalog)).toBe('price_pro_m_v2'); // new checkouts
    expect(resolvePriceId('price_pro_m', env, catalog)).toEqual({ code: 'PRO', version: 1, interval: 'monthly' }); // renewals
    expect(planVersion('PRO', 1, catalog).entitlements.analysisMaxDepth).toBe(8);
    expect(planVersion('PRO', 2, catalog).entitlements.analysisMaxDepth).toBe(9);
    expect(planVersion('PRO', 99, catalog).version).toBe(2); // unknown → current
  });

  it('public catalog exposes no price IDs, only whether each interval can be bought', () => {
    const pub = publicCatalog({ STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m' });
    expect(JSON.stringify(pub)).not.toContain('price_pro_m');
    expect(pub.find((p) => p.code === 'PRO')!.purchasable).toEqual({ monthly: true, annual: false });
  });
});
