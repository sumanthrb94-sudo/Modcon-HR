// ===========================================================================
// Subscription: the trial, what happens when it ends, and who may say so.
//
// This module imports nothing, and must go on importing nothing — the same
// contract as statutoryRules.ts and returnFiles.ts. What it decides is whether
// a paying customer can use the product, which is exactly the kind of thing
// that should be checkable in a second rather than by waiting for a trial to
// expire.
//
// ---------------------------------------------------------------------------
// This is a commercial gate, and it is NOT a security boundary
//
// Worth stating at the top because the two are easy to conflate and the
// consequences of conflating them are opposite.
//
// **What the server enforces** is *who owns the subscription record*:
// `organizations/{orgId}` is readable by its own tenant and writable only by a
// super admin (`firestore.rules`), so an organisation cannot extend its own
// trial, mark itself paid, or comp itself. That is the property the whole
// design rests on, and it is real.
//
// **What the client decides** is what the app does about an expired one: a
// banner, and administrative writes refused in the UI. The rules do not deny
// reads on an unpaid tenant and should not — a company locked out of its own
// employee records over an invoice is a company that loses its attendance
// history, and no HR product should be able to do that to somebody. Somebody
// determined enough could keep using the app past the trial with devtools. That
// is a billing problem, not a breach, and it is the correct trade.
//
// ---------------------------------------------------------------------------
// It fails OPEN, deliberately
//
// `resolveSubscription` returns `active` for a tenant whose record is missing,
// unreadable or malformed. An HR system that locks a company out because a
// Firestore read failed has done far more damage than a day of unpaid use — the
// payroll still has to run on the 30th. Every path that cannot answer the
// question answers "let them work".
// ===========================================================================

/** Where a tenant stands. */
export type SubscriptionState =
  /** Inside the trial. Everything works; the banner counts down. */
  | 'trialing'
  /** Paid, or comped by a super admin. Nothing is shown. */
  | 'active'
  /** The trial ended and the grace period has not. Everything still works. */
  | 'grace'
  /** Nothing is paid and the grace period is over. Administrative writes stop. */
  | 'locked';

/** What happens the moment a trial runs out. */
export type TrialEndBehaviour =
  /** Administrative writes stop after any grace period. The default. */
  | 'lock'
  /**
   * Nothing happens. For an organisation a super admin has decided to carry —
   * a design partner, a migration in progress, a customer between purchase
   * orders. Distinct from `active` because the trial dates stay on the record
   * and the reason stays visible.
   */
  | 'stayActive';

/**
 * What the platform holds about one tenant's commercial standing.
 *
 * Lives on `organizations/{orgId}`, which is super-admin-writable and
 * tenant-readable. Every field optional: an organisation created before this
 * existed has none of them, and that reads as `active` rather than as expired.
 */
export interface SubscriptionRecord {
  /** ISO instant the trial began. Absent for an org that never had one. */
  readonly trialStartedAt?: string;
  /** ISO instant it ends. Absent means no trial is running. */
  readonly trialEndsAt?: string;
  /**
   * What the trial cost, in paise.
   *
   * Paise, not rupees, because the whole point of this field is that the figure
   * can be very small: a ₹1 trial is `100`, and a rupee-denominated float would
   * eventually be `0.01` and round to nothing. Zero is a free trial, which is a
   * different offer from a token-charge one and is stored as such.
   */
  readonly trialPricePaise?: number;
  /** Days after the trial ends before anything stops. Zero is allowed. */
  readonly graceDays?: number;
  readonly trialEndBehaviour?: TrialEndBehaviour;
  /** ISO instant a paid subscription runs to. Absent means unpaid. */
  readonly paidThrough?: string;
  /** Seats the plan covers. Absent means uncounted. */
  readonly seats?: number;
  readonly planName?: string;

  /**
   * A super admin's override, and why.
   *
   * Held as its own field rather than by editing `paidThrough`, so "this
   * customer paid" and "somebody decided to carry them" stay distinguishable —
   * a comp recorded as a payment is a comp nobody can find again, and it will
   * be found again, at renewal, by somebody who was not there.
   */
  readonly overrideUntil?: string;
  readonly overrideReason?: string;
  readonly overrideBy?: string;
  readonly overrideAt?: string;

  /** Set by a super admin to stop a tenant outright, whatever the dates say. */
  readonly suspended?: boolean;
  readonly suspendedReason?: string;
}

export interface SubscriptionStatus {
  readonly state: SubscriptionState;
  /**
   * Whole days until the thing that changes next — the trial ending, the grace
   * running out, the paid term expiring. Null when nothing is counting down.
   */
  readonly daysRemaining: number | null;
  /** True when administrative writes should be refused. */
  readonly locked: boolean;
  /** Why, in words a person can act on. Empty when there is nothing to say. */
  readonly message: string;
  /** True when a super admin's override is what is keeping this tenant open. */
  readonly onOverride: boolean;
  /** The instant the current state runs out, if it does. */
  readonly until: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an ISO instant, or null. Never throws, never returns NaN. */
function instant(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Whole days from `now` to `then`, rounded **up**.
 *
 * Up, so a trial with four hours left says "1 day" rather than "0 days" — zero
 * reads as expired, and it is not. The countdown reaches zero only when the
 * moment has actually passed, which is when the state changes anyway.
 */
function daysUntil(then: number, now: number): number {
  return Math.max(0, Math.ceil((then - now) / DAY_MS));
}

/** Days a trial runs by default when a super admin does not say otherwise. */
export const DEFAULT_TRIAL_DAYS = 14;
/** Days after a trial ends before anything stops, by default. */
export const DEFAULT_GRACE_DAYS = 3;

/**
 * Decide where a tenant stands, at an instant.
 *
 * The order of the checks is the whole of the logic and it is not arbitrary:
 *
 *   1. **Suspended** beats everything, including a paid term. It is a super
 *      admin stopping a tenant deliberately, and a payment that has not been
 *      refunded yet must not quietly undo it.
 *   2. **An override** beats the dates. That is what an override is for.
 *   3. **A paid term** beats a trial — an organisation that paid mid-trial is
 *      active, not trialing, and should stop being counted down at.
 *   4. **The trial**, then its grace, then locked.
 *
 * Anything unparseable at any step falls through to `active`. See the note at
 * the top: this fails open on purpose.
 */
export function resolveSubscription(
  record: SubscriptionRecord | null | undefined,
  nowIso: string = new Date().toISOString(),
): SubscriptionStatus {
  const now = instant(nowIso) ?? Date.now();

  const open = (message = ''): SubscriptionStatus => ({
    state: 'active', daysRemaining: null, locked: false, message, onOverride: false, until: null,
  });

  if (!record || typeof record !== 'object') return open();

  if (record.suspended === true) {
    return {
      state: 'locked',
      daysRemaining: null,
      locked: true,
      message: record.suspendedReason?.trim()
        ? `This workspace is suspended: ${record.suspendedReason.trim()}`
        : 'This workspace is suspended. Contact your account manager.',
      onOverride: false,
      until: null,
    };
  }

  const overrideUntil = instant(record.overrideUntil);
  if (overrideUntil !== null && overrideUntil > now) {
    return {
      state: 'active',
      daysRemaining: daysUntil(overrideUntil, now),
      locked: false,
      message: record.overrideReason?.trim() ?? '',
      onOverride: true,
      until: record.overrideUntil ?? null,
    };
  }

  const paidThrough = instant(record.paidThrough);
  if (paidThrough !== null && paidThrough > now) {
    return {
      state: 'active',
      daysRemaining: daysUntil(paidThrough, now),
      locked: false,
      message: '',
      onOverride: false,
      until: record.paidThrough ?? null,
    };
  }

  const trialEndsAt = instant(record.trialEndsAt);
  // No trial and no payment on record is an organisation that predates this
  // whole feature. It works — see the note at the top.
  if (trialEndsAt === null) return open();

  if (trialEndsAt > now) {
    const days = daysUntil(trialEndsAt, now);
    return {
      state: 'trialing',
      daysRemaining: days,
      locked: false,
      message: `${days} ${days === 1 ? 'day' : 'days'} left in your trial.`,
      onOverride: false,
      until: record.trialEndsAt ?? null,
    };
  }

  if (record.trialEndBehaviour === 'stayActive') {
    return open('Your trial has ended. Your workspace stays open while billing is arranged.');
  }

  const graceDays = Number.isFinite(record.graceDays) && (record.graceDays ?? 0) >= 0
    ? Math.floor(record.graceDays as number)
    : DEFAULT_GRACE_DAYS;
  const graceEnds = trialEndsAt + graceDays * DAY_MS;

  if (graceEnds > now) {
    const days = daysUntil(graceEnds, now);
    return {
      state: 'grace',
      daysRemaining: days,
      locked: false,
      message: `Your trial has ended. ${days} ${days === 1 ? 'day' : 'days'} left before this `
        + 'workspace is locked.',
      onOverride: false,
      until: new Date(graceEnds).toISOString(),
    };
  }

  return {
    state: 'locked',
    daysRemaining: 0,
    locked: true,
    message: 'Your trial has ended. Add a payment method to keep using this workspace.',
    onOverride: false,
    until: null,
  };
}

/**
 * Start a trial, as a record to write.
 *
 * Returns the fields rather than writing them, so the one definition of "what a
 * trial looks like" is here and testable, and the Firestore call is somewhere
 * that can be mocked out of a unit test.
 *
 * The price is carried on the record rather than looked up at charge time,
 * because a discounted offer is a promise made on a particular day and a tenant
 * who signed up under a ₹1 trial should not be charged ₹499 because the
 * campaign ended while they were still in it.
 */
export function startTrial(input: {
  now?: string;
  days?: number;
  pricePaise?: number;
  graceDays?: number;
  behaviour?: TrialEndBehaviour;
  planName?: string;
  seats?: number;
}): SubscriptionRecord {
  const now = instant(input.now) ?? Date.now();
  const days = Number.isFinite(input.days) && (input.days ?? 0) > 0
    ? Math.floor(input.days as number)
    : DEFAULT_TRIAL_DAYS;
  const grace = Number.isFinite(input.graceDays) && (input.graceDays ?? 0) >= 0
    ? Math.floor(input.graceDays as number)
    : DEFAULT_GRACE_DAYS;

  return {
    trialStartedAt: new Date(now).toISOString(),
    trialEndsAt: new Date(now + days * DAY_MS).toISOString(),
    trialPricePaise: Math.max(0, Math.round(input.pricePaise ?? 0)),
    graceDays: grace,
    trialEndBehaviour: input.behaviour ?? 'lock',
    ...(input.planName ? { planName: input.planName } : {}),
    ...(Number.isFinite(input.seats) ? { seats: Math.max(0, Math.floor(input.seats as number)) } : {}),
  };
}

/** A price in paise, as rupees for a human. `100` is "₹1". */
export function formatPaise(paise: number): string {
  const safe = Number.isFinite(paise) && paise > 0 ? Math.round(paise) : 0;
  const rupees = safe / 100;
  // No decimals on a whole-rupee figure: "₹1.00 trial" reads as a rounding of
  // something else, where "₹1 trial" reads as the offer it is.
  return `₹${rupees % 1 === 0 ? rupees.toLocaleString('en-IN') : rupees.toFixed(2)}`;
}

/**
 * Which capabilities a locked workspace loses.
 *
 * Named rather than checked inline at each call site, so "what does locked
 * actually stop" has one answer that can be read and argued with.
 *
 * **Reading is never blocked, and neither is anybody's own data.** An employee
 * still sees their attendance, their leave balance and their payslips; the
 * organisation still sees its directory. What stops is the administrative work
 * a paying customer is paying for — running payroll, hiring, changing
 * configuration. Locking somebody out of their own employment record over their
 * employer's invoice is not a lever this product should have.
 */
export const LOCKED_CAPABILITIES = [
  'Running payroll and generating statutory returns',
  'Adding or removing employees',
  'Approving leave, expenses and regularizations',
  'Changing organisation settings',
  'Publishing jobs and moving candidates',
] as const;

/** True when a write of this kind should be refused on a locked workspace. */
export function isBlockedWhileLocked(
  action: 'payroll' | 'directory' | 'approvals' | 'settings' | 'recruitment' | 'read' | 'self',
): boolean {
  return action !== 'read' && action !== 'self';
}
