'use client';
import { Suspense, useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import NotificationBell from '@/components/NotificationBell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Membership {
  tier: 'FREE' | 'PREMIUM';
  status: 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  renewsAt: string | null;
  hasBillingAccount: boolean;
}

const PREMIUM_PERKS = [
  'Engine analysis up to depth 8 (vs. depth 4 on Free)',
  'Access to the full premium puzzle library',
  'Priority support',
];

// useSearchParams() requires a Suspense boundary somewhere above it in the App
// Router (same reason GameBoard.tsx wraps its own use of it) — this reads the
// checkout=success/cancelled query param SubscriptionsService redirects back to.
export default function MembershipPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>}>
      <MembershipPageInner />
    </Suspense>
  );
}

function MembershipPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<'monthly' | 'annual' | 'portal' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const checkoutResult = searchParams.get('checkout'); // 'success' | 'cancelled' | null

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    axios.get(`${API_URL}/subscriptions/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setMembership(res.data))
      .catch(() => setActionError('Could not load your membership status.'))
      .finally(() => setLoading(false));
  }, [router]);

  const startCheckout = async (plan: 'monthly' | 'annual') => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setActionError(null);
    setActionPending(plan);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/checkout`, { plan }, { headers: { Authorization: `Bearer ${token}` } });
      window.location.href = res.data.url;
    } catch (err: any) {
      // Most likely a 503 — Stripe isn't configured on this server (see
      // STATUS.md's Phase 13 section: no live Stripe credentials were available in
      // this dev environment). Surfaced plainly rather than a silent failure.
      setActionError(err?.response?.data?.message || 'Payments are not available right now. Please try again later.');
      setActionPending(null);
    }
  };

  const openBillingPortal = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setActionError(null);
    setActionPending('portal');
    try {
      const res = await axios.post(`${API_URL}/subscriptions/portal`, {}, { headers: { Authorization: `Bearer ${token}` } });
      window.location.href = res.data.url;
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Could not open the billing portal right now.');
      setActionPending(null);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading membership...</div>;

  const isPremium = membership?.tier === 'PREMIUM';

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-3xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Membership</h1>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={() => router.push('/')} className="text-blue-600 hover:underline font-medium">
            Back Home
          </button>
        </div>
      </div>

      {checkoutResult === 'success' && (
        <div className="w-full max-w-3xl mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          Checkout complete! It may take a few moments for your Premium access to activate.
        </div>
      )}
      {checkoutResult === 'cancelled' && (
        <div className="w-full max-w-3xl mb-6 p-4 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 text-sm">
          Checkout was cancelled — no changes were made to your membership.
        </div>
      )}
      {actionError && (
        <div className="w-full max-w-3xl mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {actionError}
        </div>
      )}

      <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-gray-100 p-8 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 uppercase tracking-wide">Current plan</p>
            <p className={`text-2xl font-bold mt-1 ${isPremium ? 'text-amber-600' : 'text-slate-700'}`}>
              {isPremium ? 'Premium' : 'Free'}
            </p>
            {membership?.status === 'PAST_DUE' && (
              <p className="text-sm text-orange-600 mt-1">Your last payment failed — please update your billing details.</p>
            )}
            {isPremium && membership?.renewsAt && (
              <p className="text-sm text-gray-500 mt-1">Renews {new Date(membership.renewsAt).toLocaleDateString()}</p>
            )}
          </div>
          {membership?.hasBillingAccount && (
            <button
              onClick={openBillingPortal}
              disabled={actionPending !== null}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
            >
              {actionPending === 'portal' ? 'Opening...' : 'Manage Billing'}
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-gray-100 p-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Premium perks</h2>
        <ul className="space-y-2 mb-6">
          {PREMIUM_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-slate-700">
              <span className="text-green-600 font-bold">✓</span>
              {perk}
            </li>
          ))}
        </ul>

        {isPremium ? (
          <p className="text-sm text-slate-500">You already have Premium access. Thank you for your support!</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => startCheckout('monthly')}
              disabled={actionPending !== null}
              className="flex-1 px-6 py-3 text-white font-semibold bg-amber-600 rounded-lg hover:bg-amber-700 transition shadow disabled:opacity-50"
            >
              {actionPending === 'monthly' ? 'Redirecting...' : 'Upgrade Monthly'}
            </button>
            <button
              onClick={() => startCheckout('annual')}
              disabled={actionPending !== null}
              className="flex-1 px-6 py-3 text-amber-700 font-semibold bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition disabled:opacity-50"
            >
              {actionPending === 'annual' ? 'Redirecting...' : 'Upgrade Annual (save more)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
