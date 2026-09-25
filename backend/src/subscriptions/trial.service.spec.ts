import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TrialService, trialConfig } from './trial.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

const DAY = 86_400_000;

describe('TrialService (7-day, no card, once per account)', () => {
  let trials: TrialService;
  let users: UsersService;
  let notify: jest.Mock;
  let record: jest.Mock;
  const OLD_ENV = process.env;

  beforeEach(async () => {
    process.env = { ...OLD_ENV };
    delete process.env.TRIAL_DAYS;
    delete process.env.TRIAL_PLAN;
    delete process.env.TRIALS_ENABLED;
    notify = jest.fn().mockResolvedValue({});
    record = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [User], synchronize: true }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [
        TrialService,
        UsersService,
        { provide: NotificationsService, useValue: { notify } },
        { provide: AuditService, useValue: { record } },
      ],
    }).compile();
    trials = module.get(TrialService);
    users = module.get(UsersService);
  });

  afterEach(() => { process.env = OLD_ENV; });

  it('defaults: enabled, 7 days, Premium', () => {
    expect(trialConfig({} as any)).toEqual({ enabled: true, days: 7, plan: 'PREMIUM' });
    expect(trialConfig({ TRIAL_DAYS: '14', TRIAL_PLAN: 'pro' } as any)).toEqual({ enabled: true, days: 14, plan: 'PRO' });
    expect(trialConfig({ TRIAL_DAYS: 'abc', TRIAL_PLAN: 'FREE' } as any)).toEqual({ enabled: true, days: 7, plan: 'PREMIUM' });
  });

  it('starts a 7-day Premium trial that grants Premium immediately, notifies and audits', async () => {
    const u = await users.create('alice', 'h');
    const now = new Date('2026-09-23T10:00:00Z');
    const access = await trials.startTrial(u.id, undefined, now);
    expect(access).toMatchObject({ plan: 'PREMIUM', source: 'TRIAL' });
    expect(access.trial.endsAt!.getTime()).toBe(now.getTime() + 7 * DAY);
    expect(notify).toHaveBeenCalledWith(u.id, 'TRIAL_STARTED', expect.stringContaining('7-day'));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'trial.started', targetId: u.id }));
  });

  it('only once per account — even after the trial has ended', async () => {
    const u = await users.create('bob', 'h');
    const start = new Date('2026-01-01T00:00:00Z');
    await trials.startTrial(u.id, undefined, start);
    await expect(trials.startTrial(u.id, undefined, new Date(start.getTime() + 30 * DAY))).rejects.toBeInstanceOf(ConflictException);
  });

  it('access ends by itself when the trial period is over', async () => {
    const u = await users.create('carol', 'h');
    const start = new Date('2026-01-01T00:00:00Z');
    await trials.startTrial(u.id, undefined, start);
    const fresh = await users.findOneById(u.id);
    expect(users.accessFor(fresh, new Date(start.getTime() + 7 * DAY - 1000)).plan).toBe('PREMIUM');
    expect(users.accessFor(fresh, new Date(start.getTime() + 7 * DAY + 1000)).plan).toBe('FREE');
  });

  it('is refused to paying subscribers and when trials are switched off', async () => {
    const u = await users.create('dave', 'h');
    await users.applyMembershipUpdate(u.id, { tier: 'PREMIUM', status: 'ACTIVE', stripeSubscriptionId: 'sub', renewsAt: null, planVersion: 1 });
    await expect(trials.startTrial(u.id)).rejects.toBeInstanceOf(ConflictException);

    const e = await users.create('erin', 'h');
    process.env.TRIALS_ENABLED = 'false';
    await expect(trials.startTrial(e.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sends "ending soon" once, a day before, and "ended" once, after', async () => {
    const u = await users.create('frank', 'h');
    const start = new Date('2026-01-01T00:00:00Z');
    await trials.startTrial(u.id, undefined, start);
    notify.mockClear();

    expect(await trials.sendTrialNotices(new Date(start.getTime() + 3 * DAY))).toEqual({ endingSoon: 0, ended: 0 });
    expect(await trials.sendTrialNotices(new Date(start.getTime() + 6.5 * DAY))).toEqual({ endingSoon: 1, ended: 0 });
    expect(await trials.sendTrialNotices(new Date(start.getTime() + 6.6 * DAY))).toEqual({ endingSoon: 0, ended: 0 });
    expect(await trials.sendTrialNotices(new Date(start.getTime() + 7.1 * DAY))).toEqual({ endingSoon: 0, ended: 1 });
    expect(await trials.sendTrialNotices(new Date(start.getTime() + 8 * DAY))).toEqual({ endingSoon: 0, ended: 0 });
    expect(notify.mock.calls.map((c) => c[1])).toEqual(['TRIAL_ENDING', 'TRIAL_ENDED']);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: 'trial.ended', actorType: 'SYSTEM' }));
  });
});
