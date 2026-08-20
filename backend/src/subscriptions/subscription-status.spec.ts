import { mapStripeSubscriptionStatus } from './subscription-status';

describe('mapStripeSubscriptionStatus', () => {
  it('maps "active" to PREMIUM/ACTIVE', () => {
    expect(mapStripeSubscriptionStatus('active')).toEqual({ tier: 'PREMIUM', status: 'ACTIVE' });
  });

  it('maps "trialing" to PREMIUM/ACTIVE — a trial is still real access', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toEqual({ tier: 'PREMIUM', status: 'ACTIVE' });
  });

  it('maps "past_due" to PREMIUM/PAST_DUE — a grace period, not an immediate cutoff', () => {
    expect(mapStripeSubscriptionStatus('past_due')).toEqual({ tier: 'PREMIUM', status: 'PAST_DUE' });
  });

  it('maps "canceled" to FREE/CANCELED', () => {
    expect(mapStripeSubscriptionStatus('canceled')).toEqual({ tier: 'FREE', status: 'CANCELED' });
  });

  it('maps "unpaid" to FREE/CANCELED — retries exhausted, no access', () => {
    expect(mapStripeSubscriptionStatus('unpaid')).toEqual({ tier: 'FREE', status: 'CANCELED' });
  });

  it('maps "incomplete_expired" to FREE/CANCELED — checkout never actually completed', () => {
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toEqual({ tier: 'FREE', status: 'CANCELED' });
  });

  it('maps "incomplete" to FREE/NONE — payment not yet confirmed, no access in the meantime', () => {
    expect(mapStripeSubscriptionStatus('incomplete')).toEqual({ tier: 'FREE', status: 'NONE' });
  });

  it('maps "paused" to FREE/NONE', () => {
    expect(mapStripeSubscriptionStatus('paused')).toEqual({ tier: 'FREE', status: 'NONE' });
  });

  it('never grants access for an unrecognized/future Stripe status — fails closed, not open', () => {
    expect(mapStripeSubscriptionStatus('some_new_status_stripe_invents_later')).toEqual({ tier: 'FREE', status: 'NONE' });
  });
});
