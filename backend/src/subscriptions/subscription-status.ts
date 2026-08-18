// Pure, framework-independent mapping from Stripe's own subscription status vocabulary
// to this app's simpler two-field model — same "pure module" pattern as the engine,
// matchmaking, chat-filter, move-classification, move-timing-stats. No Stripe SDK
// import here on purpose: this is exhaustively unit-testable against Stripe's
// documented status strings without ever constructing a real Stripe client.
export type MembershipTier = 'FREE' | 'PREMIUM';
export type MembershipStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface MembershipMapping {
  tier: MembershipTier;
  status: MembershipStatus;
}

// Stripe's real subscription.status values: 'active' | 'trialing' | 'past_due' |
// 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused'.
export function mapStripeSubscriptionStatus(stripeStatus: string): MembershipMapping {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return { tier: 'PREMIUM', status: 'ACTIVE' };
    case 'past_due':
      // Standard SaaS practice: a payment problem alone doesn't cut access
      // immediately — Stripe keeps retrying, and only actually cancels the
      // subscription (customer.subscription.deleted) after its own retry schedule
      // is exhausted. Access during the grace period, visibility into the problem.
      return { tier: 'PREMIUM', status: 'PAST_DUE' };
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return { tier: 'FREE', status: 'CANCELED' };
    default:
      // 'incomplete' (checkout started, payment not yet confirmed), 'paused', or
      // any future Stripe status this app doesn't specifically recognize yet —
      // never grant access on an unrecognized signal.
      return { tier: 'FREE', status: 'NONE' };
  }
}
