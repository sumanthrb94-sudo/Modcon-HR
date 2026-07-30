/**
 * Multi-tenancy: every collection is scoped by orgId.
 *
 * Before this, most collections were `allow read: if isSignedIn()` with no
 * orgId on the documents at all, so one company's HR — or any of its
 * employees — could read another company's employees, payroll, expenses and
 * assets. These tests assert that isolation now holds on every collection
 * rather than only the ones that happened to be looked at.
 *
 * Two behaviours here are deliberate and easy to mistake for bugs:
 *
 *   1. A document with no `orgId` reads as the default organisation, so legacy
 *      data stays readable when these rules deploy instead of vanishing. The
 *      matching risk is on the query side, not the rules side — see the
 *      backfill test at the bottom.
 *   2. Super admins bypass the org check, because they administer every
 *      organisation and switch between them in the UI.
 *
 * Run with `npm run test:rules` (serialised — see handbook.rules.test.mjs).
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  superA: { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b' },
  // No orgId: the accounts that predate multi-org support. They resolve to
  // the 'default' org key.
  legacyAdmin: { uid: 'legacy-admin', email: 'legacy-admin@example.com', role: 'hr' },
  legacyEmployee: { uid: 'legacy-employee', email: 'legacy-employee@example.com', role: 'employee' },
};

/** Collections that are plain org-scoped tenant data. */
const PLAIN = [
  'employees', 'attendance', 'payroll_runs', 'jobs', 'candidates',
  'onboarding', 'goals', 'performance_reviews', 'assets',
  'billing_preferences', 'billing_invoices',
];

/** Employee-authored collections: create/update by the author, org-scoped. */
const SELF_SERVE = ['expenses', 'helpdesk_tickets', 'regularizations'];

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: HOST,
      port: PORT,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
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
        displayName: user.email,
        role: user.role,
        ...(user.orgId ? { orgId: user.orgId } : {}),
        ...(user.superAdmin ? { superAdmin: true } : {}),
      });
    }

    for (const name of [...PLAIN, ...SELF_SERVE]) {
      await setDoc(doc(db, name, 'doc-a'), { id: 'doc-a', orgId: 'org-a', label: 'org A record' });
      await setDoc(doc(db, name, 'doc-b'), { id: 'doc-b', orgId: 'org-b', label: 'org B record' });
      // Written before multi-tenancy: carries no orgId at all.
      await setDoc(doc(db, name, 'doc-legacy'), { id: 'doc-legacy', label: 'legacy record' });
    }

    // Salary and leave, which layer org scoping on top of their own rules.
    await setDoc(doc(db, 'employee_compensation', 'emp-a'), { employeeId: 'emp-a', orgId: 'org-a', ctc: 100 });
    await setDoc(doc(db, 'employee_compensation', 'emp-b'), { employeeId: 'emp-b', orgId: 'org-b', ctc: 200 });
    await setDoc(doc(db, 'payslips', 'ps-a'), { employeeId: 'emp-a', orgId: 'org-a', netPay: 10 });
    await setDoc(doc(db, 'payslips', 'ps-b'), { employeeId: 'emp-b', orgId: 'org-b', netPay: 20 });
    await setDoc(doc(db, 'leave_requests', 'lr-a'), { employeeId: 'emp-a', orgId: 'org-a', status: 'Pending', managerChainIds: [] });
    await setDoc(doc(db, 'leave_requests', 'lr-b'), { employeeId: 'emp-b', orgId: 'org-b', status: 'Pending', managerChainIds: [] });
    await setDoc(doc(db, 'leave_balances', 'lb-a'), { employeeId: 'emp-a', orgId: 'org-a', available: 5, managerChainIds: [] });
    await setDoc(doc(db, 'leave_balances', 'lb-b'), { employeeId: 'emp-b', orgId: 'org-b', available: 5, managerChainIds: [] });
  });
}

// ---------------------------------------------------------------------------
// Cross-organisation reads
// ---------------------------------------------------------------------------

describe('multi-tenancy — reads are confined to your own organisation', () => {
  beforeEach(seed);

  for (const name of [...PLAIN, ...SELF_SERVE]) {
    it(`${name}: HR of org A cannot read org B's record`, async () => {
      await assertFails(getDoc(doc(as(USERS.hrA), name, 'doc-b')));
    });

    it(`${name}: HR of org A reads their own org's record`, async () => {
      await assertSucceeds(getDoc(doc(as(USERS.hrA), name, 'doc-a')));
    });

    it(`${name}: an employee of org B cannot read org A's record`, async () => {
      await assertFails(getDoc(doc(as(USERS.employeeB), name, 'doc-a')));
    });

    it(`${name}: an unfiltered list is denied`, async () => {
      // The whole query fails because it would return other tenants' documents.
      await assertFails(getDocs(collection(as(USERS.hrA), name)));
    });

    it(`${name}: a list filtered to my own org is allowed`, async () => {
      await assertSucceeds(
        getDocs(query(collection(as(USERS.hrA), name), where('orgId', '==', 'org-a'))),
      );
    });

    it(`${name}: a list filtered to another org is denied`, async () => {
      await assertFails(
        getDocs(query(collection(as(USERS.hrA), name), where('orgId', '==', 'org-b'))),
      );
    });
  }
});

describe('multi-tenancy — salary and leave stay org-scoped too', () => {
  beforeEach(seed);

  it("HR of org A cannot read org B's compensation", async () => {
    // This is the KNOWN GAP recorded in the salary/leave spec, now closed.
    await assertFails(getDoc(doc(as(USERS.hrA), 'employee_compensation', 'emp-b')));
  });

  it("HR of org A reads their own org's compensation", async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'employee_compensation', 'emp-a')));
  });

  it("HR of org A cannot read org B's payslip", async () => {
    await assertFails(getDoc(doc(as(USERS.hrA), 'payslips', 'ps-b')));
  });

  it("HR of org A cannot read org B's leave request or balance", async () => {
    await assertFails(getDoc(doc(as(USERS.hrA), 'leave_requests', 'lr-b')));
    await assertFails(getDoc(doc(as(USERS.hrA), 'leave_balances', 'lb-b')));
  });
});

// ---------------------------------------------------------------------------
// Cross-organisation writes
// ---------------------------------------------------------------------------

describe('multi-tenancy — writes cannot cross organisations', () => {
  beforeEach(seed);

  for (const name of PLAIN) {
    it(`${name}: HR of org A cannot write into org B`, async () => {
      await assertFails(
        setDoc(doc(as(USERS.hrA), name, 'new-doc'), { id: 'new-doc', orgId: 'org-b' }),
      );
    });

    it(`${name}: HR of org A writes into their own org`, async () => {
      await assertSucceeds(
        setDoc(doc(as(USERS.hrA), name, 'new-doc'), { id: 'new-doc', orgId: 'org-a' }),
      );
    });

    it(`${name}: HR of org A cannot overwrite org B's existing record`, async () => {
      await assertFails(
        setDoc(doc(as(USERS.hrA), name, 'doc-b'), { id: 'doc-b', orgId: 'org-a' }),
      );
    });
  }

  it('an employee cannot file an expense into another organisation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'expenses', 'new-exp'), {
        id: 'new-exp', orgId: 'org-b', employeeId: USERS.employeeA.uid,
      }),
    );
  });

  it('an employee files an expense into their own organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'expenses', 'new-exp'), {
        id: 'new-exp', orgId: 'org-a', employeeId: USERS.employeeA.uid,
      }),
    );
  });

  it('billing is no longer writable by any signed-in user', async () => {
    // Was `allow write: if isSignedIn()` — company billing configuration that
    // any employee could rewrite.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'billing_preferences', 'prefs'), { orgId: 'org-a', plan: 'free' }),
    );
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'billing_preferences', 'prefs'), { orgId: 'org-a', plan: 'pro' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Legacy data and super admins
// ---------------------------------------------------------------------------

describe('multi-tenancy — legacy documents and super admins', () => {
  beforeEach(seed);

  it('a legacy document reads as the default org, so legacy accounts still see it', async () => {
    // Deliberate: deploying these rules must not make every pre-existing
    // record disappear. Missing orgId is read as 'default', and a legacy
    // account (no orgId) resolves to 'default' too.
    await assertSucceeds(getDoc(doc(as(USERS.legacyEmployee), 'employees', 'doc-legacy')));
  });

  it('a legacy document is NOT visible to a real organisation', async () => {
    await assertFails(getDoc(doc(as(USERS.hrA), 'employees', 'doc-legacy')));
  });

  it('BACKFILL REQUIRED: a legacy document is invisible to the org-filtered query that reads it', async () => {
    // The asymmetry the backfill exists to fix, asserted so it cannot be
    // forgotten. The rules permit a legacy document (above), but Firestore
    // equality filters do not match a document missing the field, so the
    // org-scoped query every hook issues silently omits it. Permitted, but
    // unreachable — until src/lib/orgBackfill.ts stamps it.
    const snap = await getDocs(
      query(collection(as(USERS.legacyAdmin), 'employees'), where('orgId', '==', 'default')),
    );
    const ids = snap.docs.map((d) => d.id);
    if (ids.includes('doc-legacy')) {
      throw new Error('expected the un-backfilled legacy document to be missing from the filtered query');
    }
  });

  it('a super admin reads across organisations', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.superA), 'employees', 'doc-a')));
    await assertSucceeds(getDoc(doc(as(USERS.superA), 'employees', 'doc-b')));
  });

  it('a super admin can list unfiltered', async () => {
    await assertSucceeds(getDocs(collection(as(USERS.superA), 'employees')));
  });
});
