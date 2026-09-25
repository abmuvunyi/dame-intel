import { Entitlements, PlanCode, currentPlan, isPlanCode, planRank, planVersion } from './plans';

// Works out what a player can use RIGHT NOW. Pure: every feature gate in the app goes
// through here (via UsersService.accessFor), so "who gets what" is decided in one place.
//
// Order of precedence: an active paid subscription, then an active trial — whichever
// is the higher plan — otherwise Free. Trials expire by time alone: no background job
// has to run for access to end on schedule.

export const TRIAL_DEFAULT_DAYS = 7;

export interface AccessSubject {
  membershipTier?: string | null;
  membershipStatus?: string | null;
  planVersion?: number | null;
  trialPlan?: string | null;
  trialPlanVersion?: number | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
}

export type AccessSource = 'SUBSCRIPTION' | 'TRIAL' | 'FREE';

export interface Access {
  plan: PlanCode;
  version: number;
  source: AccessSource;
  entitlements: Entitlements;
  trial: { active: boolean; used: boolean; plan: PlanCode | null; endsAt: Date | null };
}

const PAID_STATUSES = new Set(['ACTIVE', 'PAST_DUE']);

const toDate = (v: Date | string | null | undefined): Date | null => (v ? new Date(v) : null);

export function isTrialActive(subject: AccessSubject | null | undefined, now: Date = new Date()): boolean {
  const ends = toDate(subject?.trialEndsAt);
  return !!ends && isPlanCode(subject?.trialPlan) && ends.getTime() > now.getTime();
}

export function accessFor(subject: AccessSubject | null | undefined, now: Date = new Date()): Access {
  const trialEnds = toDate(subject?.trialEndsAt);
  const trialPlan = isPlanCode(subject?.trialPlan) ? subject.trialPlan : null;
  const trial = {
    active: isTrialActive(subject, now),
    used: !!subject?.trialStartedAt,
    plan: trialPlan,
    endsAt: trialEnds,
  };

  const candidates: { plan: PlanCode; version: number; source: AccessSource }[] = [];
  if (subject && isPlanCode(subject.membershipTier) && subject.membershipTier !== 'FREE'
      && PAID_STATUSES.has(subject.membershipStatus ?? '')) {
    const v = planVersion(subject.membershipTier, subject.planVersion);
    candidates.push({ plan: v.code, version: v.version, source: 'SUBSCRIPTION' });
  }
  if (trial.active && trialPlan) {
    const v = planVersion(trialPlan, subject?.trialPlanVersion);
    candidates.push({ plan: v.code, version: v.version, source: 'TRIAL' });
  }

  // Highest plan wins; on a tie the paid subscription wins (it was pushed first).
  const best = candidates.reduce<(typeof candidates)[number] | null>(
    (acc, c) => (!acc || planRank(c.plan) > planRank(acc.plan) ? c : acc),
    null,
  );
  if (!best) {
    const free = currentPlan('FREE');
    return { plan: 'FREE', version: free.version, source: 'FREE', entitlements: free.entitlements, trial };
  }
  return { ...best, entitlements: planVersion(best.plan, best.version).entitlements, trial };
}
