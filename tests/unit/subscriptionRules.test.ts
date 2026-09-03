// Unit tests for the subscription state machine in src/data/subscriptionRules.ts.
//
// Run: npm run test:unit
//
// What this decides is whether a paying customer can use the product, and the
// interesting cases are all about *time* — which is exactly what is miserable
// to test through a UI and trivial to test here by passing an instant in.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GRACE_DAYS,
  DEFAULT_TRIAL_DAYS,
  formatPaise,
  isBlockedWhileLocked,
  resolveSubscription,
  startTrial,
  type SubscriptionRecord,
} from '../../src/data/subscriptionRules.ts';

const NOW = '2026-06-15T10:00:00.000Z';
const days = (n: number) =>
  new Date(Date.parse(NOW) + n * 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// It fails open
// ---------------------------------------------------------------------------

test('a tenant with no subscription record works', () => {
  // An organisation created before any of this existed. Locking it out because
  // it has no trial dates would take an HR system away from a paying customer
  // on the strength of a schema change.
  for (const record of [null, undefined, {} as SubscriptionRecord]) {
    const status = resolveSubscription(record, NOW);
    assert.equal(status.state, 'active');
    assert.equal(status.locked, false);
  }
});

test('unparseable dates read as active, not as expired', () => {
  const status = resolveSubscription({ trialEndsAt: 'not a date' }, NOW);
  assert.equal(status.state, 'active');
  assert.equal(status.locked, false);
  // The direction matters: a Firestore read that came back malformed must not
  // be the reason payroll cannot run on the 30th.
});

// ---------------------------------------------------------------------------
// The trial
// ---------------------------------------------------------------------------

test('a running trial counts down and blocks nothing', () => {
  const status = resolveSubscription({ trialEndsAt: days(5) }, NOW);
  assert.equal(status.state, 'trialing');
  assert.equal(status.daysRemaining, 5);
  assert.equal(status.locked, false);
  assert.match(status.message, /5 days left/);
});

test('the last few hours of a trial are a day, not zero', () => {
  const status = resolveSubscription({ trialEndsAt: days(0.16) }, NOW); // ~4 hours
  assert.equal(status.state, 'trialing');
  // Rounded up: zero reads as expired, and it is not. The countdown reaches
  // zero when the moment actually passes, which is when the state changes.
  assert.equal(status.daysRemaining, 1);
  assert.match(status.message, /1 day left/);
});

test('an expired trial falls into grace before it locks', () => {
  const record: SubscriptionRecord = { trialEndsAt: days(-1), graceDays: 3 };
  const status = resolveSubscription(record, NOW);
  assert.equal(status.state, 'grace');
  assert.equal(status.locked, false);
  assert.equal(status.daysRemaining, 2);
  assert.match(status.message, /before this workspace is locked/);
});

test('grace running out locks the workspace', () => {
  const status = resolveSubscription({ trialEndsAt: days(-5), graceDays: 3 }, NOW);
  assert.equal(status.state, 'locked');
  assert.equal(status.locked, true);
  assert.match(status.message, /Add a payment method/);
});

test('zero grace days locks the moment the trial ends', () => {
  // A real setting, not a degenerate one — and `graceDays ?? DEFAULT` would
  // quietly turn it into three, which is why the check is on finiteness.
  const status = resolveSubscription({ trialEndsAt: days(-0.01), graceDays: 0 }, NOW);
  assert.equal(status.state, 'locked');
});

test('an absent grace setting uses the default rather than none', () => {
  const justInside = resolveSubscription({ trialEndsAt: days(-(DEFAULT_GRACE_DAYS - 1)) }, NOW);
  assert.equal(justInside.state, 'grace');
  const justOutside = resolveSubscription({ trialEndsAt: days(-(DEFAULT_GRACE_DAYS + 1)) }, NOW);
  assert.equal(justOutside.state, 'locked');
});

test('stayActive carries an organisation past the end of its trial', () => {
  const status = resolveSubscription(
    { trialEndsAt: days(-30), trialEndBehaviour: 'stayActive' },
    NOW,
  );
  assert.equal(status.state, 'active');
  assert.equal(status.locked, false);
  assert.match(status.message, /stays open while billing is arranged/);
});

// ---------------------------------------------------------------------------
// Payment, override and suspension — the order they beat each other in
// ---------------------------------------------------------------------------

test('a paid term ends the trial countdown', () => {
  // Paying mid-trial makes you a customer, not a trialist, and being counted
  // down at after you have paid is how a renewal notice reads as a threat.
  const status = resolveSubscription({ trialEndsAt: days(5), paidThrough: days(365) }, NOW);
  assert.equal(status.state, 'active');
  assert.equal(status.daysRemaining, 365);
  assert.equal(status.message, '');
});

test('a lapsed paid term falls back to the trial rules, not to active', () => {
  const status = resolveSubscription(
    { trialEndsAt: days(-10), paidThrough: days(-1), graceDays: 3 },
    NOW,
  );
  assert.equal(status.state, 'locked');
});

test('a super admin override beats the dates', () => {
  const status = resolveSubscription(
    {
      trialEndsAt: days(-30),
      overrideUntil: days(60),
      overrideReason: 'Design partner through the pilot',
      overrideBy: 'super@modcon.test',
    },
    NOW,
  );
  assert.equal(status.state, 'active');
  assert.equal(status.onOverride, true);
  assert.equal(status.daysRemaining, 60);
  assert.equal(status.message, 'Design partner through the pilot');
});

test('an expired override stops carrying the tenant', () => {
  const status = resolveSubscription(
    { trialEndsAt: days(-30), overrideUntil: days(-1), overrideReason: 'Pilot' },
    NOW,
  );
  assert.equal(status.state, 'locked');
  assert.equal(status.onOverride, false);
});

test('suspension beats everything, including a paid term', () => {
  const status = resolveSubscription(
    {
      paidThrough: days(365),
      overrideUntil: days(365),
      suspended: true,
      suspendedReason: 'Chargeback under investigation',
    },
    NOW,
  );
  assert.equal(status.state, 'locked');
  assert.equal(status.locked, true);
  assert.match(status.message, /Chargeback under investigation/);
  // A payment that has not been refunded yet must not quietly undo a deliberate
  // suspension — which is what checking `paidThrough` first would do.
});

test('a suspension with no reason still says something actionable', () => {
  const status = resolveSubscription({ suspended: true }, NOW);
  assert.match(status.message, /Contact your account manager/);
});

// ---------------------------------------------------------------------------
// Starting one
// ---------------------------------------------------------------------------

test('a trial started now runs for the default period', () => {
  const record = startTrial({ now: NOW });
  assert.equal(record.trialStartedAt, NOW);
  assert.equal(record.trialEndsAt, days(DEFAULT_TRIAL_DAYS));
  assert.equal(record.graceDays, DEFAULT_GRACE_DAYS);
  assert.equal(record.trialEndBehaviour, 'lock');
  assert.equal(resolveSubscription(record, NOW).state, 'trialing');
});

test('the discounted price is carried on the record, in paise', () => {
  const record = startTrial({ now: NOW, pricePaise: 100, days: 30 });
  assert.equal(record.trialPricePaise, 100);
  assert.equal(record.trialEndsAt, days(30));
  // Paise, because the whole point is that the figure can be very small: a
  // rupee-denominated float would eventually be 0.01 and round to nothing.
  assert.equal(formatPaise(record.trialPricePaise!), '₹1');
});

test('the price is stored, not looked up later', () => {
  // A discounted offer is a promise made on a particular day. Somebody who
  // signed up under a ₹1 trial must not be charged the standing price because
  // the campaign ended while they were still inside it.
  const record = startTrial({ now: NOW, pricePaise: 100 });
  assert.equal(record.trialPricePaise, 100);
});

test('a free trial and a token-charge trial are different records', () => {
  assert.equal(startTrial({ now: NOW }).trialPricePaise, 0);
  assert.equal(startTrial({ now: NOW, pricePaise: 100 }).trialPricePaise, 100);
});

test('nonsense lengths fall back rather than producing a trial that has already ended', () => {
  for (const bad of [0, -5, Number.NaN, undefined]) {
    const record = startTrial({ now: NOW, days: bad as number });
    assert.equal(record.trialEndsAt, days(DEFAULT_TRIAL_DAYS), String(bad));
    assert.equal(resolveSubscription(record, NOW).state, 'trialing', String(bad));
  }
});

test('formatting a price does not invent decimals on a whole rupee', () => {
  assert.equal(formatPaise(100), '₹1');
  assert.equal(formatPaise(49900), '₹499');
  assert.equal(formatPaise(150), '₹1.50');
  assert.equal(formatPaise(0), '₹0');
  assert.equal(formatPaise(Number.NaN), '₹0');
});

// ---------------------------------------------------------------------------
// What locked actually stops
// ---------------------------------------------------------------------------

test('locking never blocks reading, or anybody\'s own data', () => {
  assert.equal(isBlockedWhileLocked('read'), false);
  assert.equal(isBlockedWhileLocked('self'), false);
  // An employee still sees their attendance, their leave balance and their
  // payslips. Locking somebody out of their own employment record over their
  // employer's invoice is not a lever this product should have.
  assert.equal(isBlockedWhileLocked('payroll'), true);
  assert.equal(isBlockedWhileLocked('directory'), true);
  assert.equal(isBlockedWhileLocked('approvals'), true);
  assert.equal(isBlockedWhileLocked('settings'), true);
  assert.equal(isBlockedWhileLocked('recruitment'), true);
});
