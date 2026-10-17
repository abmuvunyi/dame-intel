// Pure, framework-independent mapping from Stripe's own subscription status vocabulary
// to this app's simpler model — same "pure module" pattern as the engine,
// matchmaking, chat-filter, move-classification, move-timing-stats. No Stripe SDK
// import here on purpose: this is exhaustively unit-testable against Stripe's
// documented status strings without ever constructing a real Stripe client.
//
// Deliberately returns `paid: boolean`, not a plan code — this module only ever
// knew "is the subscription itself active", never WHICH plan (that's resolved
// separately, from the Stripe price actually purchased, in subscriptions.service.ts
// via billing/plans.ts's resolvePriceId). It used to return a `tier: 'PREMIUM'`
// string that looked like a real plan code but never was one, which briefly read as
// a real reference to billing/plans.ts's PlanCode after that module's PREMIUM/PRO
// codes were renamed to PLUS/PREMIUM — simplified away here instead of carrying a
// second, coincidentally-overlapping vocabulary forward.
export type MembershipStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface MembershipMapping {
  paid: boolean;
  status: MembershipStatus;
}

// Stripe's real subscription.status values: 'active' | 'trialing' | 'past_due' |
// 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused'.
export function mapStripeSubscriptionStatus(stripeStatus: string): MembershipMapping {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return { paid: true, status: 'ACTIVE' };
    case 'past_due':
      // Standard SaaS practice: a payment problem alone doesn't cut access
      // immediately — Stripe keeps retrying, and only actually cancels the
      // subscription (customer.subscription.deleted) after its own retry schedule
      // is exhausted. Access during the grace period, visibility into the problem.
      return { paid: true, status: 'PAST_DUE' };
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return { paid: false, status: 'CANCELED' };
    default:
      // 'incomplete' (checkout started, payment not yet confirmed), 'paused', or
      // any future Stripe status this app doesn't specifically recognize yet —
      // never grant access on an unrecognized signal.
      return { paid: false, status: 'NONE' };
  }
}