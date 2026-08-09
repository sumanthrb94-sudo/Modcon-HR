/**
 * The billing arithmetic and the access states it produces.
 *
 * Money is the part of a product where a rounding error is a refund and an
 * off-by-one in a grace period is a customer locked out of their own HR system,
 * so the figures are asserted rather than eyeballed on a page.
 *
 * Run with `npm run test:sim`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnvironment, loadAppFor, storage } from './env.mjs';

installBrowserEnvironment();

let app;

before(async () => {
  app = await loadAppFor('org-billing');
});

after(() => { setTimeout(() => process.exit(0), 50).unref(); });

describe('billing — one organisation, one price', () => {
  it('the plan is ₹5,000 per month, whatever the headcount', () => {
    assert.equal(app.PLAN_PRICE_PAISE, 500_000);
    assert.equal(app.PLAN.interval, 'monthly');
    assert.equal(app.PLAN.currency, 'INR');
    assert.equal(app.formatPaise(app.PLAN.pricePaise), '₹5,000.00');
  });

  it('GST is added on top, in whole paise', () => {
    const price = app.priceFor(1);
    assert.equal(price.basePaise, 500_000);
    assert.equal(price.gstPaise, 90_000, '18% of ₹5,000 is ₹900');
    assert.equal(price.totalPaise, 590_000);
    assert.equal(app.formatPaise(price.totalPaise), '₹5,900.00');
  });

  it('a multi-month period multiplies the base before tax', () => {
    const year = app.priceFor(12);
    assert.equal(year.basePaise, 6_000_000);
    assert.equal(year.gstPaise, 1_080_000);
    assert.equal(year.totalPaise, 7_080_000);
    // The property that made paise the unit: twelve months of rupee floats
    // do not have to add up, and these do, exactly.
    assert.equal(year.basePaise, app.priceFor(1).basePaise * 12);
    assert.equal(Number.isInteger(year.totalPaise), true);
  });

  it('every amount is an integer, because Razorpay takes paise', () => {
    for (const periods of [1, 2, 3, 6, 12, 24]) {
      const price = app.priceFor(periods);
      assert.equal(Number.isInteger(price.basePaise), true);
      assert.equal(Number.isInteger(price.gstPaise), true);
      assert.equal(Number.isInteger(price.totalPaise), true);
    }
  });
});

describe('billing — what an organisation is told about its subscription', () => {
  const period = (status, end, extra = {}) => ({
    orgId: 'org-billing',
    status,
    currentPeriodStart: '2026-06-01',
    currentPeriodEnd: end,
    pricePaise: 500_000,
    ...extra,
  });

  it('a paid organisation mid-period is told nothing', () => {
    const access = app.accessState(period('active', '2026-07-01'), '2026-06-15');
    assert.equal(access.kind, 'ok');
  });

  it('a renewal within three days is flagged, not hidden', () => {
    const access = app.accessState(period('active', '2026-07-01'), '2026-06-29');
    assert.equal(access.kind, 'warn');
    assert.match(access.message, /renews in 2 days/);
  });

  it('a trial counts down', () => {
    const access = app.accessState(period('trialing', '2026-06-15'), '2026-06-10');
    assert.equal(access.kind, 'warn');
    assert.match(access.message, /trial ends in 5 days/);
  });

  it('a failed payment says so while access continues', () => {
    const access = app.accessState(period('past_due', '2026-07-01'), '2026-06-20');
    assert.equal(access.kind, 'warn');
    assert.match(access.message, /did not go through/);
  });

  it('an overdue organisation keeps working through the grace period', () => {
    // Losing access to your own employee records the morning a card expires is
    // not a reasonable response to a payment problem.
    const access = app.accessState(period('active', '2026-07-01'), '2026-07-04');
    assert.equal(access.kind, 'warn');
    assert.match(access.message, /Access continues for 4 more days/);
  });

  it('and is blocked once the grace period is past', () => {
    const access = app.accessState(period('active', '2026-07-01'), '2026-07-09');
    assert.equal(access.kind, 'blocked');
    assert.match(access.message, /8 days overdue/);
  });

  it('a status of active does not survive a period end on its own', () => {
    // The status is only as fresh as the last webhook that wrote it, so an
    // organisation whose card failed silently would read `active` for ever if
    // nothing compared it to a date.
    const stale = app.accessState(period('active', '2026-01-01'), '2026-06-15');
    assert.equal(stale.kind, 'blocked');
  });

  it('a cancelled subscription runs to the end of the paid period', () => {
    const during = app.accessState(period('cancelled', '2026-07-01'), '2026-06-20');
    assert.equal(during.kind, 'warn');
    assert.match(during.message, /access ends in 11 days/);

    const after = app.accessState(period('cancelled', '2026-07-01'), '2026-07-02');
    assert.equal(after.kind, 'blocked');
  });

  it('an organisation with no record at all is not subscribed', () => {
    const none = app.accessState(null, '2026-06-15');
    assert.equal(none.kind, 'blocked');
    assert.match(none.message, /no active subscription/);
  });

  it('a fresh trial runs a fortnight from the day it starts', () => {
    const trial = app.trialSubscription('org-billing', '2026-06-01');
    assert.equal(trial.status, 'trialing');
    assert.equal(trial.currentPeriodEnd, '2026-06-15');
    assert.equal(app.accessState(trial, '2026-06-01').kind, 'warn');
    assert.equal(app.accessState(trial, '2026-06-30').kind, 'blocked');
  });
});

describe('billing — a super admin is not a customer', () => {
  // The platform operator administers every organisation and belongs to none,
  // so they have nothing to bill. The billing panel used to show them a plan
  // card, a price and a Pay button — a commercial relationship that does not
  // exist — and the sidebar told them they were "Not subscribed", which is a
  // statement about nobody.
  const superAdmin = { uid: 'super-1', email: 'super@modcon.test', role: 'admin', superAdmin: true };
  const hr = { uid: 'hr-1', email: 'hr@acme.test', role: 'hr', orgId: 'org-acme' };
  const unassigned = { uid: 'nobody-1', email: 'nobody@example.test', role: 'employee' };

  it('a super admin has no organisation to bill, even with one selected', () => {
    assert.equal(app.billableOrgId(superAdmin), null);
    assert.equal(app.isBillableAccount(superAdmin), false);
    // Still true when they carry an orgId for some other reason: being a super
    // admin is what decides it, not the absence of the field.
    assert.equal(app.isBillableAccount({ ...superAdmin, orgId: 'org-acme' }), false);
  });

  it("an organisation's own administrator is the one who pays", () => {
    assert.equal(app.billableOrgId(hr), 'org-acme');
    assert.equal(app.isBillableAccount(hr), true);
  });

  it('an account attached to no organisation is not billed either', () => {
    assert.equal(app.billableOrgId(unassigned), null);
    assert.equal(app.isBillableAccount(unassigned), false);
  });

  it('and neither is a signed-out visitor', () => {
    assert.equal(app.isBillableAccount(null), false);
    assert.equal(app.isBillableAccount(undefined), false);
  });
});

describe('billing — the client cannot make itself paid', () => {
  it('there is no writer on the subscription module, only a cache', () => {
    // The Firestore rule is the real control (tests/rules/subscription.rules.test.mjs);
    // this asserts the client offers no path to reach for in the first place.
    assert.equal(typeof app.cacheSubscription, 'function');
    assert.equal(app.saveSubscription, undefined);
    assert.equal(app.setSubscriptionStatus, undefined);
  });

  it('the cache is namespaced to the organisation like every other local key', () => {
    app.cacheSubscription({
      orgId: 'org-billing', status: 'active',
      currentPeriodStart: '2026-06-01', currentPeriodEnd: '2026-07-01', pricePaise: 500_000,
    });
    assert.ok(storage.keys().includes('modcon.hr.subscription::org:org-billing'));
    assert.equal(app.readCachedSubscription().status, 'active');
  });

  it('clearing the cache is how "no subscription" is represented', () => {
    app.cacheSubscription(null);
    assert.equal(app.readCachedSubscription(), null);
    assert.equal(app.accessState(app.readCachedSubscription(), '2026-06-15').kind, 'blocked');
  });
});
