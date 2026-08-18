import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { UsersService } from '../users/users.service';
import { mapStripeSubscriptionStatus } from './subscription-status';

// Where the frontend redirects back to after Stripe's own hosted Checkout/Portal
// flow — configurable, defaults to local dev.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

@Injectable()
export class SubscriptionsService {
  constructor(
    private stripeService: StripeService,
    private usersService: UsersService,
  ) {}

  async createCheckoutSession(userId: number, plan: 'monthly' | 'annual'): Promise<{ url: string }> {
    const priceId = plan === 'monthly' ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_ANNUAL;
    if (!priceId) {
      throw new BadRequestException(`No Stripe price configured for the "${plan}" plan.`);
    }

    const user = await this.usersService.findOneById(userId);
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.stripeService.findOrCreateCustomer(userId, user.stripeCustomerId);
    if (!user.stripeCustomerId) {
      await this.usersService.setStripeCustomerId(userId, customerId);
    }

    const session = await this.stripeService.createCheckoutSession({
      customerId,
      userId,
      priceId,
      successUrl: `${APP_URL}/membership?checkout=success`,
      cancelUrl: `${APP_URL}/membership?checkout=cancelled`,
    });

    if (!session.url) throw new BadRequestException('Stripe did not return a checkout URL.');
    return { url: session.url };
  }

  async createPortalSession(userId: number): Promise<{ url: string }> {
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No billing account exists yet — start a checkout first.');
    }

    const session = await this.stripeService.createPortalSession(user.stripeCustomerId, `${APP_URL}/membership`);
    return { url: session.url };
  }

  // The single entry point for every Stripe webhook event this app subscribes to —
  // called only after StripeService.constructWebhookEvent has already verified the
  // signature. This is the ONLY code path that ever calls
  // UsersService.applyMembershipUpdate — Stripe's own event stream is the sole
  // source of truth for who has access, never a client-side "I paid, trust me" call.
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Deliberately silent for event types this app doesn't act on — Stripe
        // sends many more event types than any integration typically needs, and
        // logging every unhandled one would just be noise.
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    // Links the Stripe Customer to our user id — the actual tier/status update comes
    // from the customer.subscription.* events Stripe fires as part of the same
    // checkout completion, handled separately below, so this doesn't duplicate that
    // logic or risk it disagreeing with the subscription's own authoritative state.
    const userId = session.client_reference_id ? parseInt(session.client_reference_id, 10) : null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!userId || !customerId) return;

    const user = await this.usersService.findOneById(userId);
    if (user && !user.stripeCustomerId) {
      await this.usersService.setStripeCustomerId(userId, customerId);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const user = await this.usersService.findByStripeCustomerId(customerId);
    if (!user) {
      console.warn(`[Subscriptions] Received a subscription event for unknown Stripe customer ${customerId}`);
      return;
    }

    const { tier, status } = mapStripeSubscriptionStatus(subscription.status);
    const periodEnd = (subscription as any).current_period_end as number | undefined;
    await this.usersService.applyMembershipUpdate(user.id, {
      tier,
      status,
      stripeSubscriptionId: subscription.id,
      renewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const user = await this.usersService.findByStripeCustomerId(customerId);
    if (!user) return;

    await this.usersService.applyMembershipUpdate(user.id, {
      tier: 'FREE',
      status: 'CANCELED',
      stripeSubscriptionId: null,
      renewsAt: null,
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;
    const user = await this.usersService.findByStripeCustomerId(customerId);
    if (!user) return;

    // A failed payment alone doesn't cut access — Stripe's own retry schedule owns
    // that decision, surfaced later via customer.subscription.updated (-> past_due)
    // or .deleted once retries are exhausted. This just keeps the visible status
    // honest in the meantime, preserving whatever tier/subscription the user already had.
    await this.usersService.applyMembershipUpdate(user.id, {
      tier: user.membershipTier,
      status: 'PAST_DUE',
      stripeSubscriptionId: user.stripeSubscriptionId,
      renewsAt: user.membershipRenewsAt,
    });
  }
}
