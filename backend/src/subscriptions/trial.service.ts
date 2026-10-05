import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PlanCode, currentPlan, isPlanCode } from '../billing/plans';
import { TRIAL_DEFAULT_DAYS } from '../billing/access';
import { errorDetail } from '../common/error-detail';

const DAY_MS = 86_400_000;

export interface TrialConfig {
  enabled: boolean;
  days: number;
  plan: PlanCode;
}

// Free trial without a card: one per account, ever. Access simply ends when
// trialEndsAt passes (billing/access.ts) — the hourly job below only sends the
// "ending soon" / "ended" notices; it is not needed for access to stop on time.
export function trialConfig(env: NodeJS.ProcessEnv = process.env): TrialConfig {
  const days = Math.floor(Number(env.TRIAL_DAYS));
  const plan = (env.TRIAL_PLAN ?? 'PLUS').toUpperCase();
  return {
    enabled: env.TRIALS_ENABLED !== 'false',
    days: days >= 1 && days <= 90 ? days : TRIAL_DEFAULT_DAYS,
    plan: isPlanCode(plan) && plan !== 'FREE' ? plan : 'PLUS',
  };
}

@Injectable()
export class TrialService {
  private readonly logger = new Logger('TrialService');

  constructor(
    private readonly usersService: UsersService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async startTrial(userId: number, req?: any, now: Date = new Date()) {
    const config = trialConfig();
    if (!config.enabled) throw new ForbiddenException('Free trials are not available right now.');
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.trialStartedAt) throw new ConflictException('You have already used your free trial.');
    const access = this.usersService.accessFor(user, now);
    if (access.source === 'SUBSCRIPTION') throw new ConflictException('You already have a paid membership.');

    const plan = currentPlan(config.plan);
    const endsAt = new Date(now.getTime() + config.days * DAY_MS);
    const updated = await this.usersService.startTrial(user.id, plan.code, plan.version, now, endsAt);

    await this.audit?.record({
      action: 'trial.started', actorUserId: user.id, targetType: 'user', targetId: user.id,
      details: { plan: plan.code, version: plan.version, days: config.days, endsAt: endsAt.toISOString() }, req,
    });
    await this.safeNotify(user.id, 'TRIAL_STARTED',
      `Your ${config.days}-day ${plan.name} trial has started. It ends on ${endsAt.toUTCString()} — no payment details needed.`);
    return this.usersService.accessFor(updated, now);
  }

  // Hourly: warn a day before a trial ends, and confirm when it has ended.
  @Cron(CronExpression.EVERY_HOUR)
  async sendTrialNotices(now: Date = new Date()): Promise<{ endingSoon: number; ended: number }> {
    const soon = await this.usersService.findTrialsEndingSoon(now, DAY_MS);
    for (const u of soon) {
      await this.safeNotify(u.id, 'TRIAL_ENDING', `Your free trial ends on ${new Date(u.trialEndsAt!).toUTCString()}. Upgrade to keep your features.`);
      await this.usersService.markTrialNotified(u.id, 'trialEndingNotifiedAt', now);
    }
    const ended = await this.usersService.findEndedTrialsToNotify(now);
    for (const u of ended) {
      const stillPaid = this.usersService.accessFor(u, now).source === 'SUBSCRIPTION';
      if (!stillPaid) {
        await this.safeNotify(u.id, 'TRIAL_ENDED', 'Your free trial has ended and your account is back on the Free plan. Upgrade anytime from Membership.');
      }
      await this.usersService.markTrialNotified(u.id, 'trialEndedNotifiedAt', now);
      await this.audit?.record({
        action: 'trial.ended', actorType: 'SYSTEM', targetType: 'user', targetId: u.id,
        details: { plan: u.trialPlan, endedAt: u.trialEndsAt ? new Date(u.trialEndsAt).toISOString() : null, convertedToPaid: stillPaid },
      });
    }
    return { endingSoon: soon.length, ended: ended.length };
  }

  private async safeNotify(userId: number, type: string, message: string) {
    try {
      await this.notifications?.notify(userId, type, message);
    } catch (err) {
      this.logger.error(`Failed to send ${type} notification to user ${userId}: ${errorDetail(err)}`);
    }
  }
}
