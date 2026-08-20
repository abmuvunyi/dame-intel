import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

// Thin wrapper around the real Stripe SDK — every call in this file is Stripe's own
// hosted flow (Checkout Session, Billing Portal Session, webhook signature
// verification). This app never collects, sees, or stores raw card data at any
// point; the brief's "confirm Stripe's hosted flow is used throughout" is true by
// construction here, not just by convention — there is no code path anywhere in
// this service (or SubscriptionsService) that accepts a card number, CVC, or similar.
//
// Runs in a genuinely disabled-but-non-crashing mode when STRIPE_SECRET_KEY isn't
// set (true in this dev environment — see STATUS.md's Phase 13 section for why no
// real Stripe test-mode keys were available) — the exact same graceful-fallback
// pattern main.ts's Redis adapter already uses, rather than either crashing the
// whole app at boot or silently pretending payments work.
@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      console.warn('[Stripe] STRIPE_SECRET_KEY not set — subscriptions endpoints will return 503 rather than crash the app.');
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  private requireClient(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Payments are not configured on this server.');
    }
    return this.stripe;
  }

  async findOrCreateCustomer(userId: number, existingCustomerId: string | null, email?: string): Promise<string> {
    if (existingCustomerId) return existingCustomerId;
    const customer = await this.requireClient().customers.create({
      metadata: { userId: String(userId) },
      email,
    });
    return customer.id;
  }

  async createCheckoutSession(params: {
    customerId: string;
    userId: number;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.requireClient().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      // The single reliable way to tie a completed Checkout session back to our own
      // user id inside the webhook handler — Stripe echoes this back verbatim on
      // every event derived from this session.
      client_reference_id: String(params.userId),
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    return this.requireClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // Verifies the event genuinely came from Stripe (HMAC signature over the exact raw
  // request bytes) before anything in this app trusts its contents — this is the
  // entire reason main.ts turns on rawBody: true.
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Webhook signing secret is not configured on this server.');
    }
    return this.requireClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
