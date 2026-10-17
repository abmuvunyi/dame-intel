// Local development only: create (or reset) one account per plan so every tier can be
// tried by hand without Stripe. Refuses to run with NODE_ENV=production.
//
//   npm run dev:test-accounts                 (password: testpass123)
//   npm run dev:test-accounts -- <password>
//
// Accounts: test_free, test_plus, test_premium. Re-running resets their password,
// plan and trial state. The paid plans are written as an ACTIVE subscription with no
// Stripe id, exactly as the webhook would store a real one.
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PlanCode, currentPlan } from '../billing/plans';

const ACCOUNTS: { username: string; plan: PlanCode }[] = [
  { username: 'test_free', plan: 'FREE' },
  { username: 'test_plus', plan: 'PLUS' },
  { username: 'test_premium', plan: 'PREMIUM' },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to create test accounts with NODE_ENV=production.');
    process.exit(2);
  }
  process.env.PUZZLE_SEED_ON_BOOT = 'false';
  const password = process.argv[2] ?? 'testpass123';
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const users = app.get(UsersService);
    const repo = app.get<Repository<User>>(getRepositoryToken(User));
    const audit = app.get(AuditService);
    const passwordHash = await bcrypt.hash(password, 10);
    const renewsAt = new Date(Date.now() + 365 * 86_400_000);

    for (const { username, plan } of ACCOUNTS) {
      let user = await users.findOneByUsername(username);
      if (!user) user = await users.create(username, passwordHash);
      user.passwordHash = passwordHash;
      user.tokenVersion = (user.tokenVersion ?? 0) + 1; // sign out old sessions on reset
      user.trialPlan = null;
      user.trialPlanVersion = null;
      user.trialStartedAt = null;
      user.trialEndsAt = null;
      user.lastFreeReviewAt = null;
      user.lastFreeReviewGameId = null;
      await repo.save(user);

      await users.applyMembershipUpdate(user.id, plan === 'FREE'
        ? { tier: 'FREE', status: 'NONE', stripeSubscriptionId: null, renewsAt: null, planVersion: null, stripePriceId: null, billingInterval: null }
        : { tier: plan, status: 'ACTIVE', stripeSubscriptionId: null, renewsAt, planVersion: currentPlan(plan).version, stripePriceId: null, billingInterval: 'monthly' });
      await audit.record({
        action: 'subscription.changed', actorType: 'CLI', targetType: 'user', targetId: user.id,
        details: { plan, reason: 'dev:test-accounts (local test account, no Stripe)' },
      });

      const access = users.accessFor(await users.findOneById(user.id));
      console.log(`${username.padEnd(13)} → ${access.plan} (analysis depth ${access.entitlements.analysisMaxDepth}, AI up to ${access.entitlements.maxAiDifficulty})`);
    }
    console.log(`\nPassword for all three: ${password}`);
  } finally {
    await app.close();
  }
}

void main();
