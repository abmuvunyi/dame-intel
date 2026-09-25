import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { UsersService } from '../users/users.service';
import { mapStripeSubscriptionStatus } from './subscription-status';
import { BillingInterval, PlanCode, currentPlan, isPlanCode, priceIdFor, resolvePriceId } from '../billing/plans';
import { AuditService } from '../audit/audit.service';
import type { User } from '../users/user.entity';

const logger = new Logger('SubscriptionsService');

// Where the frontend redirects back to after Stripe's own hosted Checkout/Portal
// flow — configurable, defaults to local dev.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

@Injectable()
export class SubscriptionsService {
  constructor(
    private stripeService: StripeService,
    private usersService: UsersService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * Starts a Stripe Checkout for a paid plan. Always uses the plan's CURRENT catalog
   * version. `plan` may also be the Phase 13 shorthand 'monthly' | 'annual' (= Premium).
   */
  async createCheckoutSession(
    userId: number,
    plan: PlanCode | 'monthly' | 'annual',
    interval: BillingInterval = 'monthly',
    req?: any,
  ): Promise<{ url: string }> {
    const code: PlanCode = plan === 'monthly' || plan === 'annual' ? 'PREMIUM' : plan;
    const billing: BillingInterval = plan === 'monthly' || plan === 'annual' ? plan : interval;
    if (!isPlanCode(code) || code === 'FREE') throw new BadRequestException('Choose a paid plan: PREMIUM or PRO.');
    const priceId = priceIdFor(code, billing);
    if (!priceId) {
      throw new BadRequestException(`No Stripe price configured for ${code} (${billing}).`);
    }

    const user = await this.usersService.findOneById(userId);
    if (!user) throw new NotFoundException('User not found');
    // One subscription per account: plan changes (upgrade/downgrade/interval) go
    // through Stripe's billing portal, which updates the existing subscription.
    if (user.stripeSubscriptionId && ['ACTIVE', 'PAST_DUE'].includes(user.membershipStatus)) {
      throw new BadRequestException('You already have a subscription — change plans from "Manage billing".');
    }

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
    await this.audit?.record({
      action: 'subscription.checkout_started', actorUserId: userId, targetType: 'user', targetId: userId,
      details: { plan: code, version: currentPlan(code).version, interval: billing }, req,
    });
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
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
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
      logger.warn(`[Subscriptions] Received a subscription event for unknown Stripe customer ${customerId}`);
      return;
    }

    const { tier: mappedTier, status } = mapStripeSubscriptionStatus(subscription.status);
    const item = (subscription as any).items?.data?.[0];
    const priceId: string | null = item?.price?.id ?? null;
    // Newer Stripe API versions put the period end on the item; older ones on the subscription.
    const periodEnd = (item?.current_period_end ?? (subscription as any).current_period_end) as number | undefined;

    let tier = 'FREE';
    let planVersion: number | null = null;
    let billingInterval: string | null = null;
    if (mappedTier !== 'FREE') {
      const resolved = resolvePriceId(priceId);
      if (resolved) {
        ({ code: tier, version: planVersion, interval: billingInterval } = resolved);
      } else if (priceId && priceId === user.stripePriceId && isPlanCode(user.membershipTier) && user.membershipTier !== 'FREE') {
        // A price no longer in the env/catalog but already on record for this user:
        // keep exactly the plan version they bought (grandfathered).
        tier = user.membershipTier;
        planVersion = user.planVersion;
        billingInterval = user.billingInterval;
      } else {
        // Paying customer on a price we can't map: never cut them off, grant Premium
        // and make the misconfiguration loud so the catalog/env can be fixed.
        tier = 'PREMIUM';
        planVersion = currentPlan('PREMIUM').version;
        logger.error(`[Subscriptions] Unknown Stripe price "${priceId}" on subscription ${subscription.id} — granted PREMIUM. Add it to the plan catalog / env.`);
        await this.audit?.record({
          action: 'subscription.unknown_price', actorType: 'STRIPE', targetType: 'user', targetId: user.id,
          details: { priceId, subscriptionId: subscription.id },
        });
      }
    }

    await this.applyAndAudit(user, {
      tier,
      status,
      stripeSubscriptionId: subscription.id,
      renewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
      planVersion,
      stripePriceId: priceId,
      billingInterval,
    });
  }

  private async applyAndAudit(user: User, update: Parameters<UsersService['applyMembershipUpdate']>[1]) {
    const before = { plan: user.membershipTier, version: user.planVersion, status: user.membershipStatus };
    await this.usersService.applyMembershipUpdate(user.id, update);
    const after = { plan: update.tier, version: update.planVersion ?? user.planVersion, status: update.status };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await this.audit?.record({
        action: 'subscription.changed', actorType: 'STRIPE', targetType: 'user', targetId: user.id,
        details: { before, after, stripeSubscriptionId: update.stripeSubscriptionId },
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const user = await this.usersService.findByStripeCustomerId(customerId);
    if (!user) return;

    await this.applyAndAudit(user, {
      tier: 'FREE',
      status: 'CANCELED',
      stripeSubscriptionId: null,
      renewsAt: null,
      planVersion: null,
      stripePriceId: null,
      billingInterval: null,
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
    await this.applyAndAudit(user, {
      tier: user.membershipTier,
      status: 'PAST_DUE',
      stripeSubscriptionId: user.stripeSubscriptionId,
      renewsAt: user.membershipRenewsAt,
    });
  }
}
