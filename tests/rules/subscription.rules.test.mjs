/**
 * Subscriptions — an organisation may read whether it has paid, and may not
 * decide it.
 *
 * This is the one collection in the system whose whole point is that the tenant
 * does not control it. Everything else an organisation owns, it edits; this
 * states whether it has paid us, and an organisation that could write it would
 * write `active`. So the tests that matter here are the refusals, and they are
 * run for every role the product has — an employee, a manager, an HR
 * administrator and a platform admin — because "HR can do anything in their own
 * org" is true everywhere else in this ruleset and must not be true here.
 *
 * The webhook that legitimately writes these records runs with the Admin SDK,
 * which bypasses rules entirely, so there is nothing to allow it here. See
 * docs/billing-razorpay.md.
 *
 * Run with `npm run test:rules`.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const USERS = {
  superAdmin: { uid: 'super-1', email: 'super@example.com', role: 'admin', superAdmin: true },
  platformAdmin: { uid: 'admin-1', email: 'admin@example.com', role: 'admin', orgId: ORG_A },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: ORG_A },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: ORG_A },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: ORG_A },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: ORG_B },
};

/** ₹5,000 in paise — the same figure src/data/subscription.ts ships. */
const PRICE_PAISE = 500_000;

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const user of Object.values(USERS)) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        role: user.role,
        ...(user.orgId ? { orgId: user.orgId } : {}),
        ...(user.superAdmin ? { superAdmin: true } : {}),
      });
    }
    // Org A is paid. Org B has never subscribed — its document is absent, which
    // is the state the client reads as "not subscribed".
    await setDoc(doc(db, 'subscriptions', ORG_A), {
      orgId: ORG_A,
      status: 'active',
      currentPeriodStart: '2026-06-01',
      currentPeriodEnd: '2026-07-01',
      pricePaise: PRICE_PAISE,
    });
  });
}

describe('subscriptions — an organisation reads its own billing state', () => {
  beforeEach(seed);

  for (const role of ['hrA', 'managerA', 'employeeA', 'platformAdmin']) {
    it(`${role} reads their own organisation's subscription`, async () => {
      await assertSucceeds(getDoc(doc(as(USERS[role]), 'subscriptions', ORG_A)));
    });
  }

  it('a super admin reads any organisation\'s subscription', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.superAdmin), 'subscriptions', ORG_A)));
  });

  it('an organisation that has never subscribed reads a clean miss, not a denial', async () => {
    // Keyed by org id, so nothing dereferences `resource`. A denial here would
    // be indistinguishable from an unpaid account and would surface to a paying
    // customer as a billing failure.
    await assertSucceeds(getDoc(doc(as(USERS.hrB), 'subscriptions', ORG_B)));
  });
});

describe('subscriptions — no organisation reads another\'s', () => {
  beforeEach(seed);

  it("HR of org B cannot read org A's subscription", async () => {
    await assertFails(getDoc(doc(as(USERS.hrB), 'subscriptions', ORG_A)));
  });

  it('only a super admin may list them', async () => {
    await assertFails(getDocs(collection(as(USERS.hrA), 'subscriptions')));
    await assertFails(getDocs(collection(as(USERS.platformAdmin), 'subscriptions')));
    await assertSucceeds(getDocs(collection(as(USERS.superAdmin), 'subscriptions')));
  });
});

describe('subscriptions — nobody in the client can make themselves paid', () => {
  beforeEach(seed);

  // The whole reason this collection exists separately from org_settings.
  for (const role of ['hrA', 'managerA', 'employeeA', 'platformAdmin']) {
    it(`${role} cannot create a subscription for their own organisation`, async () => {
      await assertFails(setDoc(doc(as(USERS[role]), 'subscriptions', ORG_B), {
        orgId: ORG_B, status: 'active', currentPeriodStart: '2026-06-01',
        currentPeriodEnd: '2027-06-01', pricePaise: PRICE_PAISE,
      }));
    });

    it(`${role} cannot extend their own paid period`, async () => {
      await assertFails(updateDoc(doc(as(USERS[role]), 'subscriptions', ORG_A), {
        currentPeriodEnd: '2099-01-01',
      }));
    });

    it(`${role} cannot mark a failed payment active`, async () => {
      await assertFails(updateDoc(doc(as(USERS[role]), 'subscriptions', ORG_A), {
        status: 'active', lastPaymentId: 'pay_forged',
      }));
    });

    it(`${role} cannot delete the record to escape it`, async () => {
      await assertFails(deleteDoc(doc(as(USERS[role]), 'subscriptions', ORG_A)));
    });
  }

  it('HR of one organisation cannot write into another\'s', async () => {
    await assertFails(updateDoc(doc(as(USERS.hrB), 'subscriptions', ORG_A), { status: 'cancelled' }));
  });

  it('a super admin can correct a record, which is the manual path', async () => {
    await assertSucceeds(updateDoc(doc(as(USERS.superAdmin), 'subscriptions', ORG_A), {
      status: 'cancelled',
    }));
    await assertSucceeds(setDoc(doc(as(USERS.superAdmin), 'subscriptions', ORG_B), {
      orgId: ORG_B, status: 'trialing', currentPeriodStart: '2026-06-01',
      currentPeriodEnd: '2026-06-15', pricePaise: PRICE_PAISE,
    }));
  });
});
