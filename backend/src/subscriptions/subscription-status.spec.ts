import { mapStripeSubscriptionStatus } from './subscription-status';

describe('mapStripeSubscriptionStatus', () => {
  it('maps "active" to paid/ACTIVE', () => {
    expect(mapStripeSubscriptionStatus('active')).toEqual({ paid: true, status: 'ACTIVE' });
  });

  it('maps "trialing" to paid/ACTIVE — a trial is still real access', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toEqual({ paid: true, status: 'ACTIVE' });
  });

  it('maps "past_due" to paid/PAST_DUE — a grace period, not an immediate cutoff', () => {
    expect(mapStripeSubscriptionStatus('past_due')).toEqual({ paid: true, status: 'PAST_DUE' });
  });

  it('maps "canceled" to unpaid/CANCELED', () => {
    expect(mapStripeSubscriptionStatus('canceled')).toEqual({ paid: false, status: 'CANCELED' });
  });

  it('maps "unpaid" to unpaid/CANCELED — retries exhausted, no access', () => {
    expect(mapStripeSubscriptionStatus('unpaid')).toEqual({ paid: false, status: 'CANCELED' });
  });

  it('maps "incomplete_expired" to unpaid/CANCELED — checkout never actually completed', () => {
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toEqual({ paid: false, status: 'CANCELED' });
  });

  it('maps "incomplete" to unpaid/NONE — payment not yet confirmed, no access in the meantime', () => {
    expect(mapStripeSubscriptionStatus('incomplete')).toEqual({ paid: false, status: 'NONE' });
  });

  it('maps "paused" to unpaid/NONE', () => {
    expect(mapStripeSubscriptionStatus('paused')).toEqual({ paid: false, status: 'NONE' });
  });

  it('never grants access for an unrecognized/future Stripe status — fails closed, not open', () => {
    expect(mapStripeSubscriptionStatus('some_new_status_stripe_invents_later')).toEqual({ paid: false, status: 'NONE' });
  });
});