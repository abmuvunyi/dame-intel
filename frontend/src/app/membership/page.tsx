'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { API_BASE } from '@/lib/api';

// Phase 15: Free / Premium / Pro, monthly or annual, plus a one-time free trial with
// no card. Plans and what they include come from the backend catalog
// (GET /subscriptions/plans) so this page never drifts from what's enforced.

type PlanCode = 'FREE' | 'PLUS' | 'PREMIUM';
type Interval = 'monthly' | 'annual';

interface Entitlements {
  premiumPuzzles: boolean;
  analysisMaxDepth: number;
  fullGameReview: boolean;
  maxClubsOwned: number;
  hostTournaments: boolean;
  maxAiDifficulty: number;
  dailyFreeReview: boolean;
}

interface CatalogPlan {
  code: PlanCode;
  version: number;
  name: string;
  tagline: string;
  entitlements: Entitlements;
  purchasable: Record<Interval, boolean>;
}

interface Catalog {
  plans: CatalogPlan[];
  trial: { enabled: boolean; days: number; plan: PlanCode };
  paymentsEnabled: boolean;
}

interface Membership {
  plan: PlanCode;
  source: 'SUBSCRIPTION' | 'TRIAL' | 'FREE';
  entitlements: Entitlements;
  trial: { active: boolean; used: boolean; available: boolean; plan: PlanCode | null; endsAt: string | null };
  tier: PlanCode;
  status: 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  interval: Interval | null;
  renewsAt: string | null;
  hasBillingAccount: boolean;
}

// included: false renders with a muted ✕ instead of a green ✓ — a plan's gaps are
// worth showing (so Free vs. Plus is legible at a glance), but not as a false positive.
function features(e: Entitlements): { text: string; included: boolean }[] {
  return [
    { text: e.analysisMaxDepth > 0 ? `Engine analysis up to depth ${e.analysisMaxDepth}` : 'No engine analysis', included: e.analysisMaxDepth > 0 },
    { text: e.premiumPuzzles ? 'Full puzzle library, including premium puzzles' : 'Standard puzzle library', included: true },
    e.fullGameReview
      ? { text: 'Full game review: accuracy, classifications, and best continuations', included: true }
      : e.dailyFreeReview
        ? { text: '1 free game review per day, with engine analysis', included: true }
        : { text: 'No game review', included: false },
    { text: `Play AI opponents up to level ${e.maxAiDifficulty}`, included: true },
    { text: `Create up to ${e.maxClubsOwned} club${e.maxClubsOwned === 1 ? '' : 's'}`, included: true },
    ...(e.hostTournaments ? [{ text: 'Host and run your own tournaments', included: true }] : []),
  ];
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export default function MembershipPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading...</div>}>
      <MembershipPageInner />
    </Suspense>
  );
}

function MembershipPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [interval, setBillingInterval] = useState<Interval>('monthly');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const checkoutResult = searchParams.get('checkout');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      const [plans, me] = await Promise.all([
        axios.get<Catalog>(`${API_BASE}/subscriptions/plans`),
        axios.get<Membership>(`${API_BASE}/subscriptions/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setCatalog(plans.data);
      setMembership(me.data);
    } catch (err: any) {
      if (err?.response?.status === 401) router.push('/login');
      else setError('Could not load membership details.');
    }
  }, [router]);

  useEffect(() => {
    // Fetching on mount is the intended side effect here.
    void load();
  }, [load]);

  const startTrial = async () => {
    setError(null);
    setPending('trial');
    try {
      await axios.post(`${API_BASE}/subscriptions/trial`, {}, authHeaders());
      setNotice('Your free trial has started — enjoy!');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not start the trial.');
    } finally {
      setPending(null);
    }
  };

  const checkout = async (plan: PlanCode) => {
    setError(null);
    setPending(plan);
    try {
      const res = await axios.post(`${API_BASE}/subscriptions/checkout`, { plan, interval }, authHeaders());
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Payments are not available right now. Please try again later.');
      setPending(null);
    }
  };

  const openPortal = async () => {
    setError(null);
    setPending('portal');
    try {
      const res = await axios.post(`${API_BASE}/subscriptions/portal`, {}, authHeaders());
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not open the billing portal right now.');
      setPending(null);
    }
  };

  const subscribed = membership?.source === 'SUBSCRIPTION' || membership?.status === 'PAST_DUE';
  const trialPlanName = catalog?.plans.find((p) => p.code === catalog.trial.plan)?.name ?? 'Premium';

  return (
    <DashboardShell>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-100 mb-6">Membership</h1>

        {checkoutResult === 'success' && (
          <div className="mb-4 p-4 rounded-lg bg-green-900/40 border border-green-700 text-green-200 text-sm">
            Checkout complete! Your new plan may take a few moments to activate.
          </div>
        )}
        {checkoutResult === 'cancelled' && (
          <div className="mb-4 p-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm">
            Checkout was cancelled — nothing changed.
          </div>
        )}
        {notice && <div className="mb-4 p-4 rounded-lg bg-green-900/40 border border-green-700 text-green-200 text-sm">{notice}</div>}
        {error && <div className="mb-4 p-4 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">{error}</div>}

        {!catalog || !membership ? (
          <p className="text-slate-400">Loading membership...</p>
        ) : (
          <>
            {/* Current access */}
            <section className="mb-6 p-6 rounded-xl bg-slate-800 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Your plan</p>
                <p className="text-2xl font-bold text-slate-100 mt-1">
                  {catalog.plans.find((p) => p.code === membership.plan)?.name ?? membership.plan}
                  {membership.source === 'TRIAL' && <span className="ml-2 text-sm font-medium text-amber-300">(free trial)</span>}
                </p>
                {membership.source === 'TRIAL' && membership.trial.endsAt && (
                  <p className="text-sm text-slate-400 mt-1">Trial ends {formatDate(membership.trial.endsAt)} — then you return to Free unless you upgrade.</p>
                )}
                {membership.source === 'SUBSCRIPTION' && membership.renewsAt && (
                  <p className="text-sm text-slate-400 mt-1">
                    Billed {membership.interval ?? 'monthly'} · renews {formatDate(membership.renewsAt)}
                  </p>
                )}
                {membership.status === 'PAST_DUE' && (
                  <p className="text-sm text-orange-300 mt-1">Your last payment failed — please update your billing details.</p>
                )}
              </div>
              {membership.hasBillingAccount && (
                <button
                  onClick={openPortal}
                  disabled={pending !== null}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {pending === 'portal' ? 'Opening...' : 'Manage billing'}
                </button>
              )}
            </section>

            {/* Trial offer */}
            {catalog.trial.enabled && membership.trial.available && (
              <section className="mb-6 p-6 rounded-xl bg-gradient-to-r from-amber-900/50 to-slate-800 border border-amber-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-amber-200">Try {trialPlanName} free for {catalog.trial.days} days</p>
                  <p className="text-sm text-slate-300">No payment details needed. It ends by itself — nothing to cancel. One trial per account.</p>
                </div>
                <button
                  onClick={startTrial}
                  disabled={pending !== null}
                  className="px-5 py-2.5 rounded-lg font-semibold bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                >
                  {pending === 'trial' ? 'Starting...' : 'Start free trial'}
                </button>
              </section>
            )}

            {/* Billing interval */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1" role="group" aria-label="Billing interval">
                {(['monthly', 'annual'] as Interval[]).map((i) => (
                  <button
                    key={i}
                    onClick={() => setBillingInterval(i)}
                    aria-pressed={interval === i}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium ${interval === i ? 'bg-green-600 text-white' : 'text-slate-300 hover:text-white'}`}
                  >
                    {i === 'monthly' ? 'Monthly' : 'Annual'}
                  </button>
                ))}
              </div>
            </div>

            {/* Plans */}
            <section className="grid gap-4 md:grid-cols-3">
              {catalog.plans.map((plan) => {
                const isCurrent = membership.plan === plan.code;
                const canBuy = plan.code !== 'FREE' && catalog.paymentsEnabled && plan.purchasable[interval];
                return (
                  <div
                    key={plan.code}
                    className={`p-6 rounded-xl border flex flex-col ${plan.code === 'PREMIUM' ? 'border-green-600 bg-slate-800' : 'border-slate-700 bg-slate-800/70'}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-xl font-bold text-slate-100">{plan.name}</h2>
                      {isCurrent && <span className="text-xs px-2 py-0.5 rounded bg-green-700/50 text-green-200">Current</span>}
                    </div>
                    <p className="text-sm text-slate-400 mt-1 mb-4">{plan.tagline}</p>
                    <ul className="space-y-2 mb-6 flex-1">
                      {features(plan.entitlements).map((f) => (
                        <li key={f.text} className={`flex gap-2 text-sm ${f.included ? 'text-slate-300' : 'text-slate-500'}`}>
                          <span className={f.included ? 'text-green-500' : 'text-slate-600'} aria-hidden>{f.included ? '✓' : '✕'}</span>
                          {f.text}
                        </li>
                      ))}
                    </ul>
                    {plan.code === 'FREE' ? (
                      <p className="text-sm text-slate-500">Always free.</p>
                    ) : subscribed ? (
                      <button
                        onClick={openPortal}
                        disabled={pending !== null || isCurrent}
                        className="w-full py-2.5 rounded-lg font-semibold border border-slate-600 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                      >
                        {isCurrent ? 'Your plan' : 'Switch in billing portal'}
                      </button>
                    ) : (
                      <button
                        onClick={() => checkout(plan.code)}
                        disabled={pending !== null || !canBuy}
                        title={canBuy ? undefined : 'Payments are not available yet'}
                        className="w-full py-2.5 rounded-lg font-semibold bg-green-600 text-white hover:bg-green-500 disabled:opacity-50"
                      >
                        {pending === plan.code ? 'Redirecting...' : `Choose ${plan.name} (${interval})`}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
            {!catalog.paymentsEnabled && (
              <p className="text-xs text-slate-500 mt-4 text-center">Online payments are not switched on yet.</p>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
