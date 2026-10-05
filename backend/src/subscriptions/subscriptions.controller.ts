import { Body, Controller, Post, Get, Req, Headers, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from './stripe.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from '../auth/auth.guard';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TrialService, trialConfig } from './trial.service';
import { CheckoutDto } from './checkout.dto';
import { publicCatalog, priceIdFor, BillingInterval } from '../billing/plans';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly trialService: TrialService,
  ) {}

  // Public: what each plan includes, which can currently be bought, and the trial
  // offer. Each purchasable plan/interval gets its REAL Stripe price when one is
  // configured (so "the price is $X" only has to be set once, in Stripe) — falling
  // back to the catalog's own static displayPrice otherwise, so the pricing page
  // still shows real-looking numbers before Stripe is ever configured at all.
  @Get('plans')
  async getPlans() {
    const catalog = publicCatalog();
    const plans = await Promise.all(catalog.map(async (plan) => {
      const displayPrice = { ...plan.displayPrice };
      if (this.stripeService.isConfigured()) {
        for (const interval of ['monthly', 'annual'] as BillingInterval[]) {
          if (!plan.purchasable[interval]) continue;
          const priceId = priceIdFor(plan.code, interval);
          const live = priceId ? await this.stripeService.getFormattedPrice(priceId) : null;
          if (live) (displayPrice as any)[interval] = live;
        }
      }
      return { ...plan, displayPrice };
    }));
    return {
      plans,
      trial: trialConfig(),
      paymentsEnabled: this.stripeService.isConfigured(),
    };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getMyMembership(@Request() req: any) {
    const user = req.authUser;
    const access = this.usersService.accessFor(user);
    return {
      // Effective access right now (paid plan, trial, or Free):
      plan: access.plan,
      planVersion: access.version,
      source: access.source,
      entitlements: access.entitlements,
      trial: { ...access.trial, available: trialConfig().enabled && !access.trial.used && access.source !== 'SUBSCRIPTION' },
      // Raw paid-subscription state (Phase 13 fields kept for compatibility):
      tier: user.membershipTier ?? 'FREE',
      status: user.membershipStatus ?? 'NONE',
      interval: user.billingInterval ?? null,
      renewsAt: user.membershipRenewsAt ?? null,
      hasBillingAccount: !!user.stripeCustomerId,
    };
  }

  @UseGuards(AuthGuard)
  @Post('checkout')
  async checkout(@Request() req: any, @Body() body: CheckoutDto) {
    return this.subscriptionsService.createCheckoutSession(req.user.sub, body.plan, body.interval ?? 'monthly', req);
  }

  // 7-day (configurable) trial, no card, once per account.
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('trial')
  async startTrial(@Request() req: any) {
    return this.trialService.startTrial(req.user.sub, req);
  }

  @UseGuards(AuthGuard)
  @Post('portal')
  async portal(@Request() req: any) {
    return this.subscriptionsService.createPortalSession(req.user.sub);
  }

  // Deliberately NOT behind AuthGuard — Stripe calls this directly, with no user
  // session at all. Its only trust mechanism is the signature check below, over the
  // exact raw request bytes (see main.ts's rawBody: true and StripeService's own
  // comment on why a JSON.parse()-and-reserialize round trip would break this).
  // Phase 14: exempt from the global rate limit — Stripe retries and bursts are
  // legitimate, and the signature check is the trust boundary here.
  @SkipThrottle()
  @Post('webhook')
  async webhook(@Req() req: any, @Headers('stripe-signature') signature: string) {
    const rawBody = req.rawBody; // attached by main.ts's { rawBody: true } app option
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing raw body or Stripe signature header.');
    }
    const event = this.stripeService.constructWebhookEvent(rawBody, signature);
    await this.subscriptionsService.handleWebhookEvent(event);
    return { received: true };
  }
}
