import { Body, Controller, Post, Get, Req, Headers, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from './stripe.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('me')
  async getMyMembership(@Request() req: any) {
    const user = await this.usersService.findOneById(req.user.sub);
    return {
      tier: user?.membershipTier ?? 'FREE',
      status: user?.membershipStatus ?? 'NONE',
      renewsAt: user?.membershipRenewsAt ?? null,
      hasBillingAccount: !!user?.stripeCustomerId,
    };
  }

  @UseGuards(AuthGuard)
  @Post('checkout')
  async checkout(@Request() req: any, @Body() body: { plan: 'monthly' | 'annual' }) {
    return this.subscriptionsService.createCheckoutSession(req.user.sub, body.plan);
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
