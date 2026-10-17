import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from './stripe.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import type Stripe from 'stripe';

// Real in-memory sqlite + real UsersService, so membership updates are genuinely
// persisted and re-readable — only StripeService is mocked (no real Stripe test-mode
// credentials were available in this environment; see STATUS.md's Phase 13 section
// for that explicit, user-directed trade-off). Webhook event payloads below are
// deliberately shaped to match Stripe's own documented event schema (id, type,
// data.object with the exact field names real Stripe events carry), not simplified
// stand-ins — handleWebhookEvent is exercised exactly as it would be against a real
// event, just without a live signature to verify (that step is StripeService's job,
// already fully bypassed for these tests since they call handleWebhookEvent directly
// with an already-"verified" event object, same as the controller would post-verification).
describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let usersService: UsersService;
  let stripeServiceMock: {
    findOrCreateCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
    createPortalSession: jest.Mock;
  };

  beforeEach(async () => {
    stripeServiceMock = {
      findOrCreateCustomer: jest.fn(),
      createCheckoutSession: jest.fn(),
      createPortalSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [User], synchronize: true }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [
        SubscriptionsService,
        UsersService,
        { provide: StripeService, useValue: stripeServiceMock },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('createCheckoutSession', () => {
    const OLD_ENV = process.env;
    beforeEach(() => { process.env = { ...OLD_ENV, STRIPE_PRICE_MONTHLY: 'price_monthly_123' }; });
    afterEach(() => { process.env = OLD_ENV; });

    it('creates a Stripe customer, persists the mapping, and returns the real checkout URL', async () => {
      const user = await usersService.create('alice', 'hash');
      stripeServiceMock.findOrCreateCustomer.mockResolvedValue('cus_new123');
      stripeServiceMock.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session/abc' });

      const result = await service.createCheckoutSession(user.id, 'monthly');
      expect(result.url).toBe('https://checkout.stripe.com/session/abc');

      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.stripeCustomerId).toBe('cus_new123');
      expect(stripeServiceMock.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
        customerId: 'cus_new123',
        userId: user.id,
        priceId: 'price_monthly_123',
      }));
    });

    it('reuses an existing Stripe customer id rather than creating a second one', async () => {
      const user = await usersService.create('bob', 'hash');
      await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_existing' });
      stripeServiceMock.findOrCreateCustomer.mockResolvedValue('cus_existing');
      stripeServiceMock.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session/xyz' });

      await service.createCheckoutSession(user.id, 'monthly');
      expect(stripeServiceMock.findOrCreateCustomer).toHaveBeenCalledWith(user.id, 'cus_existing');
    });

    it('rejects a plan with no configured Stripe price', async () => {
      const user = await usersService.create('carol', 'hash');
      await expect(service.createCheckoutSession(user.id, 'annual')).rejects.toThrow(BadRequestException); // STRIPE_PRICE_ANNUAL not set
    });

    it('throws NotFoundException for a nonexistent user', async () => {
      await expect(service.createCheckoutSession(999999, 'monthly')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPortalSession', () => {
    it('requires an existing Stripe customer — no checkout ever happened yet', async () => {
      const user = await usersService.create('dave', 'hash');
      await expect(service.createPortalSession(user.id)).rejects.toThrow(BadRequestException);
    });

    it('returns the real portal URL once a Stripe customer exists', async () => {
      const user = await usersService.create('erin', 'hash');
      await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_erin' });
      stripeServiceMock.createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/session/def' });

      const result = await service.createPortalSession(user.id);
      expect(result.url).toBe('https://billing.stripe.com/session/def');
      expect(stripeServiceMock.createPortalSession).toHaveBeenCalledWith('cus_erin', expect.any(String));
    });
  });

  describe('webhook event handling — real Stripe event schema, real DB persistence', () => {
    function stripeEvent(type: string, object: any): Stripe.Event {
      return { id: 'evt_test', type, data: { object } } as unknown as Stripe.Event;
    }

    it('checkout.session.completed links the Stripe customer id to the right user via client_reference_id', async () => {
      const user = await usersService.create('frank', 'hash');
      const event = stripeEvent('checkout.session.completed', {
        client_reference_id: String(user.id),
        customer: 'cus_frank_new',
      });

      await service.handleWebhookEvent(event);
      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.stripeCustomerId).toBe('cus_frank_new');
    });

    it('customer.subscription.created with no price info on the event grants the entry-level paid plan (PLUS)/ACTIVE and a real renewsAt date', async () => {
      const user = await usersService.create('grace', 'hash');
      await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_grace' });

      const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days out, Stripe's unix-seconds format
      const event = stripeEvent('customer.subscription.created', {
        id: 'sub_grace_1',
        customer: 'cus_grace',
        status: 'active',
        current_period_end: periodEnd,
      });

      await service.handleWebhookEvent(event);
      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.membershipTier).toBe('PLUS');
      expect(fresh!.membershipStatus).toBe('ACTIVE');
      expect(fresh!.stripeSubscriptionId).toBe('sub_grace_1');
      expect(fresh!.membershipRenewsAt).not.toBeNull();
      expect(new Date(fresh!.membershipRenewsAt!).getTime()).toBeCloseTo(periodEnd * 1000, -3);
    });

    it('customer.subscription.updated with status=canceled correctly downgrades to FREE', async () => {
      const user = await usersService.create('henry', 'hash');
      await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_henry', membershipTier: 'PLUS', membershipStatus: 'ACTIVE' });

      const event = stripeEvent('customer.subscription.updated', {
        id: 'sub_henry_1',
        customer: 'cus_henry',
        status: 'canceled',
        current_period_end: Math.floor(Date.now() / 1000),
      });

      await service.handleWebhookEvent(event);
      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.membershipTier).toBe('FREE');
      expect(fresh!.membershipStatus).toBe('CANCELED');
    });

    it('customer.subscription.deleted resets tier, status, subscription id, and renewsAt all the way', async () => {
      const user = await usersService.create('iris', 'hash');
      await (usersService as any).usersRepository.update(user.id, {
        stripeCustomerId: 'cus_iris', membershipTier: 'PLUS', membershipStatus: 'ACTIVE',
        stripeSubscriptionId: 'sub_iris_1', membershipRenewsAt: new Date(),
      });

      const event = stripeEvent('customer.subscription.deleted', { id: 'sub_iris_1', customer: 'cus_iris', status: 'canceled' });
      await service.handleWebhookEvent(event);

      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.membershipTier).toBe('FREE');
      expect(fresh!.membershipStatus).toBe('CANCELED');
      expect(fresh!.stripeSubscriptionId).toBeNull();
      expect(fresh!.membershipRenewsAt).toBeNull();
    });

    it('invoice.payment_failed marks PAST_DUE while preserving the existing tier/subscription (a grace period, not an instant downgrade)', async () => {
      const user = await usersService.create('jack', 'hash');
      const renewsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await (usersService as any).usersRepository.update(user.id, {
        stripeCustomerId: 'cus_jack', membershipTier: 'PLUS', membershipStatus: 'ACTIVE',
        stripeSubscriptionId: 'sub_jack_1', membershipRenewsAt: renewsAt,
      });

      const event = stripeEvent('invoice.payment_failed', { customer: 'cus_jack', subscription: 'sub_jack_1' });
      await service.handleWebhookEvent(event);

      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.membershipTier).toBe('PLUS'); // unchanged — still has access during the grace period
      expect(fresh!.membershipStatus).toBe('PAST_DUE');
      expect(fresh!.stripeSubscriptionId).toBe('sub_jack_1'); // preserved
    });

    // --- Phase 15: three plans, versioned prices, grandfathering ---
    describe('plan + version come from the Stripe price', () => {
      const OLD_ENV = process.env;
      beforeEach(() => {
        process.env = {
          ...OLD_ENV,
          STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_m', STRIPE_PRICE_PLUS_ANNUAL: 'price_plus_y',
          STRIPE_PRICE_PREMIUM_MONTHLY: 'price_prem_m', STRIPE_PRICE_PREMIUM_ANNUAL: 'price_prem_y',
        };
      });
      afterEach(() => { process.env = OLD_ENV; });

      const subEvent = (type: string, customer: string, priceId: string | null, status = 'active') =>
        stripeEvent(type, {
          id: `sub_${customer}`, customer, status,
          items: { data: [{ price: priceId ? { id: priceId } : null, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
        });

      it('a Premium annual price grants PREMIUM v1 with the annual interval and Premium entitlements', async () => {
        const user = await usersService.create('premium_user', 'hash');
        await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_premium' });
        await service.handleWebhookEvent(subEvent('customer.subscription.created', 'cus_premium', 'price_prem_y'));
        const fresh = await usersService.findOneById(user.id);
        expect(fresh).toMatchObject({ membershipTier: 'PREMIUM', planVersion: 1, billingInterval: 'annual', stripePriceId: 'price_prem_y' });
        expect(usersService.accessFor(fresh).entitlements.hostTournaments).toBe(true);
      });

      it('upgrading Plus → Premium in the billing portal updates the plan', async () => {
        const user = await usersService.create('upgrader', 'hash');
        await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_up' });
        await service.handleWebhookEvent(subEvent('customer.subscription.created', 'cus_up', 'price_plus_m'));
        expect((await usersService.findOneById(user.id))!.membershipTier).toBe('PLUS');
        await service.handleWebhookEvent(subEvent('customer.subscription.updated', 'cus_up', 'price_prem_m'));
        expect((await usersService.findOneById(user.id))!.membershipTier).toBe('PREMIUM');
      });

      it('grandfathering: a renewal on a price that is no longer configured keeps the version on record', async () => {
        const user = await usersService.create('oldtimer', 'hash');
        await (usersService as any).usersRepository.update(user.id, {
          stripeCustomerId: 'cus_old', membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE', planVersion: 1,
          stripePriceId: 'price_prem_2025', billingInterval: 'monthly',
        });
        await service.handleWebhookEvent(subEvent('customer.subscription.updated', 'cus_old', 'price_prem_2025'));
        expect(await usersService.findOneById(user.id)).toMatchObject({ membershipTier: 'PREMIUM', planVersion: 1, membershipStatus: 'ACTIVE' });
      });

      it('an unknown price never cuts off a paying customer (falls back to the entry-level paid plan, PLUS, loudly)', async () => {
        const user = await usersService.create('mystery', 'hash');
        await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_mystery' });
        await service.handleWebhookEvent(subEvent('customer.subscription.created', 'cus_mystery', 'price_nobody_knows'));
        expect((await usersService.findOneById(user.id))!.membershipTier).toBe('PLUS');
      });

      it('checkout for PREMIUM annual uses the current Premium annual price', async () => {
        const user = await usersService.create('buyer', 'hash');
        stripeServiceMock.findOrCreateCustomer.mockResolvedValue('cus_buyer');
        stripeServiceMock.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
        await service.createCheckoutSession(user.id, 'PREMIUM', 'annual');
        expect(stripeServiceMock.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ priceId: 'price_prem_y' }));
      });

      it('refuses a second checkout while a subscription is active (plan changes go through the portal)', async () => {
        const user = await usersService.create('twice', 'hash');
        await (usersService as any).usersRepository.update(user.id, { stripeSubscriptionId: 'sub_1', membershipStatus: 'ACTIVE', membershipTier: 'PLUS' });
        await expect(service.createCheckoutSession(user.id, 'PREMIUM', 'monthly')).rejects.toThrow(BadRequestException);
      });

      it('refuses checkout for the Free plan', async () => {
        const user = await usersService.create('freebie', 'hash');
        await expect(service.createCheckoutSession(user.id, 'FREE' as any, 'monthly')).rejects.toThrow(BadRequestException);
      });
    });

    it('a subscription event for an unrecognized Stripe customer id is a harmless no-op, not a crash', async () => {
      const event = stripeEvent('customer.subscription.updated', { id: 'sub_ghost', customer: 'cus_does_not_exist', status: 'active' });
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined();
    });

    it('an event type this app does not subscribe to is silently ignored, not an error', async () => {
      const event = stripeEvent('customer.updated', { id: 'cus_whatever' });
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined();
    });
  });
});