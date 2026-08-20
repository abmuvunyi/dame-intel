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
      stripeServiceMock.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session/abc' } as Stripe.Checkout.Session);

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

    it('customer.subscription.created grants PREMIUM/ACTIVE and a real renewsAt date', async () => {
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
      expect(fresh!.membershipTier).toBe('PREMIUM');
      expect(fresh!.membershipStatus).toBe('ACTIVE');
      expect(fresh!.stripeSubscriptionId).toBe('sub_grace_1');
      expect(fresh!.membershipRenewsAt).not.toBeNull();
      expect(new Date(fresh!.membershipRenewsAt!).getTime()).toBeCloseTo(periodEnd * 1000, -3);
    });

    it('customer.subscription.updated with status=canceled correctly downgrades to FREE', async () => {
      const user = await usersService.create('henry', 'hash');
      await (usersService as any).usersRepository.update(user.id, { stripeCustomerId: 'cus_henry', membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE' });

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
        stripeCustomerId: 'cus_iris', membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE',
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
        stripeCustomerId: 'cus_jack', membershipTier: 'PREMIUM', membershipStatus: 'ACTIVE',
        stripeSubscriptionId: 'sub_jack_1', membershipRenewsAt: renewsAt,
      });

      const event = stripeEvent('invoice.payment_failed', { customer: 'cus_jack', subscription: 'sub_jack_1' });
      await service.handleWebhookEvent(event);

      const fresh = await usersService.findOneById(user.id);
      expect(fresh!.membershipTier).toBe('PREMIUM'); // unchanged — still has access during the grace period
      expect(fresh!.membershipStatus).toBe('PAST_DUE');
      expect(fresh!.stripeSubscriptionId).toBe('sub_jack_1'); // preserved
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
