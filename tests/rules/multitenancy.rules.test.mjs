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

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  superA: { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b' },
  // The accounts that predate multi-org support, as they look *after* the
  // identity backfill: stamped with the 'default' sentinel explicitly. They
  // used to carry no orgId at all and be recognised by its absence — which is
  // exactly what made a self-registered stranger indistinguishable from them.
  // See UNASSIGNED below and G7 in docs/tenant-isolation-spec.md.
  legacyAdmin: { uid: 'legacy-admin', email: 'legacy-admin@example.com', role: 'hr', orgId: 'default' },
  legacyEmployee: { uid: 'legacy-employee', email: 'legacy-employee@example.com', role: 'employee', orgId: 'default' },
};

/**
 * A freshly self-registered account: role 'employee', no orgId, no employee
 * record, nobody's colleague. Kept out of USERS because `seed()` stamps every
 * entry there with an orgId when it has one, and the whole point of this one is
 * that it has none.
 */
const UNASSIGNED = { uid: 'unassigned', email: 'stranger@example.com', role: 'employee' };

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

    for (const user of [...Object.values(USERS), UNASSIGNED]) {
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

    // Organisation records, which carry the feature flags.
    for (const org of ['org-a', 'org-b']) {
      await setDoc(doc(db, 'organizations', org), {
        name: `Org ${org}`, adminEmail: `hr-${org}@example.com`, createdBy: 'super-a',
      });
    }
    // The legacy tenant has no organisations record at all — it predates the
    // collection. The read of it must be a clean miss, not a denial.

    // Organisation configuration, keyed `<orgKey>__<setting>`.
    for (const org of ['org-a', 'org-b']) {
      await setDoc(doc(db, 'org_settings', `${org}__leavePolicies`), {
        orgId: org, key: 'leavePolicies', valueJson: '[]',
      });
    }
    // Two organisations that split a salary differently — org A pays half as
    // Basic, org B a third. Neither may see the other's figures.
    await setDoc(doc(db, 'org_settings', 'org-a__salaryStructure'), {
      orgId: 'org-a', key: 'salaryStructure',
      valueJson: JSON.stringify({ basicPercent: 50, hraPercent: 25, medicalAllowance: 1492, conveyanceAllowance: 1492 }),
    });
    await setDoc(doc(db, 'org_settings', 'org-b__salaryStructure'), {
      orgId: 'org-b', key: 'salaryStructure',
      valueJson: JSON.stringify({ basicPercent: 33, hraPercent: 20, medicalAllowance: 800, conveyanceAllowance: 600 }),
    });
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

// ---------------------------------------------------------------------------
// The identity collections (I2 / I4 in docs/tenant-isolation-spec.md).
//
// These are not `orgId`-scoped tenant data — they carry their own tenancy — and
// that is exactly why `users` was left `allow read: if isSignedIn()` and handed
// every signed-in account of every organisation the whole platform's directory:
// each account's email, role, orgId and superAdmin flag.
// ---------------------------------------------------------------------------
describe('multi-tenancy — the user directory does not cross organisations', () => {
  beforeEach(seed);

  it('an employee reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid)));
  });

  it("an employee cannot read a colleague's profile in their own org", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeA), 'users', USERS.hrA.uid)));
  });

  it("an employee of org B cannot read an org A account", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'users', USERS.employeeA.uid)));
  });

  it("HR of org B cannot read an org A account", async () => {
    await assertFails(getDoc(doc(as(USERS.hrB), 'users', USERS.employeeA.uid)));
  });

  it('HR reads an account in their own organisation', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'users', USERS.employeeA.uid)));
  });

  it('an unfiltered list is denied to HR', async () => {
    await assertFails(getDocs(collection(as(USERS.hrA), 'users')));
  });

  it('a list filtered to my own organisation is allowed for HR', async () => {
    await assertSucceeds(
      getDocs(query(collection(as(USERS.hrA), 'users'), where('orgId', '==', 'org-a'))),
    );
  });

  it("a list filtered to another organisation is denied to HR", async () => {
    await assertFails(
      getDocs(query(collection(as(USERS.hrA), 'users'), where('orgId', '==', 'org-b'))),
    );
  });

  it('an employee cannot list the directory at all', async () => {
    await assertFails(getDocs(collection(as(USERS.employeeA), 'users')));
    await assertFails(
      getDocs(query(collection(as(USERS.employeeA), 'users'), where('orgId', '==', 'org-a'))),
    );
  });

  it('a super admin lists every organisation, which is what a platform admin is for', async () => {
    await assertSucceeds(getDocs(collection(as(USERS.superA), 'users')));
  });

  it('HR cannot move an account into another organisation', async () => {
    // I4: orgId is immutable on every HR-authored update. Without this an HR
    // manager could pull a colleague into their own tenant, or push their own
    // account into someone else's.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'users', USERS.employeeA.uid), {
        ...USERS.employeeA, role: 'employee', orgId: 'org-b',
      }),
    );
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'users', USERS.employeeB.uid), {
        ...USERS.employeeB, role: 'employee', orgId: 'org-a',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Organisation configuration (G3).
//
// Leave policies, the company profile, the holiday calendar, departments and
// the permission matrix used to live only in localStorage — org-namespaced by
// a key suffix the client owns, so the tenant boundary was hygiene rather than
// enforcement, and two admins of the same org did not even share the values.
// ---------------------------------------------------------------------------
describe('multi-tenancy — organisation configuration', () => {
  beforeEach(seed);

  const policies = (orgId, key = 'leavePolicies') => ({
    orgId, key, valueJson: JSON.stringify([{ id: 'lp1', type: 'Casual Leave', annual: 12 }]),
  });

  it('an employee reads their own organisation\'s leave policy', async () => {
    // Not administrators-only: an employee's own leave page needs the accrual
    // policy and the holiday calendar to show a balance at all.
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'org_settings', 'org-a__leavePolicies')));
  });

  it("an employee of org B cannot read org A's configuration", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'org_settings', 'org-a__leavePolicies')));
  });

  it('a setting my org has not published yet is readable, not denied', async () => {
    // The sync subscribes to every setting at sign-in, including ones this
    // organisation has never saved. A rule testing `resource.data` fails
    // evaluation on a document that does not exist, which denies the whole
    // subscription and leaves configuration silently un-synced — the bug this
    // pins down, caught by driving the real app rather than by these tests.
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'org_settings', 'org-a__holidays')));
    // …and the same absence in another organisation is still denied.
    await assertFails(getDoc(doc(as(USERS.employeeA), 'org_settings', 'org-b__holidays')));
  });

  it("HR of org B cannot read org A's configuration", async () => {
    await assertFails(getDoc(doc(as(USERS.hrB), 'org_settings', 'org-a__leavePolicies')));
  });

  it('an unfiltered list is denied, a list of my own org is allowed', async () => {
    await assertFails(getDocs(collection(as(USERS.employeeA), 'org_settings')));
    await assertSucceeds(
      getDocs(query(collection(as(USERS.employeeA), 'org_settings'), where('orgId', '==', 'org-a'))),
    );
  });

  it('HR writes their own organisation\'s configuration', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'org_settings', 'org-a__companyProfile'), policies('org-a', 'companyProfile')),
    );
  });

  it('an employee cannot write configuration', async () => {
    // The permission matrix is one of these documents. An employee who could
    // write it could grant themselves a module.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_settings', 'org-a__accessControl'), policies('org-a', 'accessControl')),
    );
  });

  it("HR of org B cannot write into org A", async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'org_settings', 'org-a__leavePolicies'), policies('org-a')),
    );
  });

  // -------------------------------------------------------------------------
  // The salary structure specifically.
  //
  // It is one of these documents and is therefore covered by the rules above,
  // but it is worth naming: it is the only setting whose value is a statement
  // about how much of somebody's pay is Basic, and the failure mode of getting
  // it wrong — one company's compensation policy applied to another's
  // payslips — is not something an administrator would notice from the UI.
  // -------------------------------------------------------------------------
  const structure = (orgId, overrides = {}) => ({
    orgId,
    key: 'salaryStructure',
    valueJson: JSON.stringify({
      basicPercent: 50, hraPercent: 25, medicalAllowance: 1492, conveyanceAllowance: 1492,
      ...overrides,
    }),
  });

  it("an employee reads their own organisation's salary structure", async () => {
    // Their own payslip breakdown is computed from it, so this must be a read
    // an ordinary employee can make.
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'org_settings', 'org-a__salaryStructure')));
  });

  it("an employee of org B cannot read org A's salary structure", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'org_settings', 'org-a__salaryStructure')));
  });

  it("HR of org B cannot read org A's salary structure", async () => {
    await assertFails(getDoc(doc(as(USERS.hrB), 'org_settings', 'org-a__salaryStructure')));
  });

  it('HR sets their own organisation\'s salary structure', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'org_settings', 'org-a__salaryStructure'), structure('org-a', { basicPercent: 40 })),
    );
  });

  it("HR of org B cannot overwrite org A's salary structure", async () => {
    // Not a hypothetical: it would silently restate every org A payslip in org
    // B's proportions.
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'org_settings', 'org-a__salaryStructure'), structure('org-a')),
    );
  });

  it("HR cannot file their own structure under another organisation's id", async () => {
    // The id carries the tenant, so this is the attempt to publish org A's
    // split into org B's slot while stamping it org-a.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'org_settings', 'org-b__salaryStructure'), structure('org-a')),
    );
  });

  it('an employee cannot set the salary structure at all', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_settings', 'org-a__salaryStructure'), structure('org-a')),
    );
  });

  it('clearing a structure is a write like any other, and stays inside the org', async () => {
    // Clearing publishes `null` as the value. It must still be an
    // administrator of that organisation doing it.
    const cleared = { orgId: 'org-a', key: 'salaryStructure', valueJson: 'null' };
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'org_settings', 'org-a__salaryStructure'), cleared));
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'org_settings', 'org-a__salaryStructure'), { ...cleared }),
    );
  });

  it("HR of org B cannot overwrite org A's existing configuration", async () => {
    // The takeover case: stamping your own orgId onto someone else's document.
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'org_settings', 'org-a__leavePolicies'), policies('org-b')),
    );
  });

  it('the document id must agree with the orgId it carries', async () => {
    // Without this an administrator could file their own org's document under
    // another org's id, and every member of that org would read it.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'org_settings', 'org-b__leavePolicies'), policies('org-a')),
    );
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'org_settings', 'org-a__somethingElse'), policies('org-a')),
    );
  });
});

// ---------------------------------------------------------------------------
// An account with no organisation (G7).
//
// The login page offered self-registration, and a new account carried no
// `orgId`. `myOrgKey()` resolved "no orgId" to 'default', which made "not yet
// given an organisation" and "a member of the incumbent organisation" the same
// value — so anyone who signed up read the default tenant's directory,
// attendance, jobs, expenses and assets. Confirmed against the live project
// before it was closed.
//
// The sentinel is still right for a *document*: one written before
// multi-tenancy is legacy data belonging to the default org (orgKeyOf). It was
// wrong for a *person*.
// ---------------------------------------------------------------------------
describe('multi-tenancy — an unassigned account is nobody', () => {
  beforeEach(seed);

  it('cannot read the default organisation, which is what it used to resolve to', async () => {
    await assertFails(getDoc(doc(as(UNASSIGNED), 'employees', 'doc-legacy')));
    await assertFails(
      getDocs(query(collection(as(UNASSIGNED), 'employees'), where('orgId', '==', 'default'))),
    );
  });

  it('cannot read any real organisation either', async () => {
    await assertFails(getDoc(doc(as(UNASSIGNED), 'employees', 'doc-a')));
    await assertFails(
      getDocs(query(collection(as(UNASSIGNED), 'employees'), where('orgId', '==', 'org-a'))),
    );
  });

  it('cannot read configuration or the handbook', async () => {
    await assertFails(getDoc(doc(as(UNASSIGNED), 'org_settings', 'default__leavePolicies')));
    await assertFails(getDoc(doc(as(UNASSIGNED), 'organizations', 'default')));
  });

  it('cannot write anything into the default organisation', async () => {
    await assertFails(
      setDoc(doc(as(UNASSIGNED), 'expenses', 'new-doc'),
        { employeeId: UNASSIGNED.uid, orgId: 'default', amount: 1 }),
    );
  });

  it('still reads its own profile, so sign-in works', async () => {
    // Failing closed must not mean failing to sign in: the upsert reads and
    // writes its own users document, and an account that cannot do that is
    // broken rather than merely unauthorised.
    await assertSucceeds(getDoc(doc(as(UNASSIGNED), 'users', UNASSIGNED.uid)));
  });

  it('a stamped default-org account is unaffected', async () => {
    // Why the identity backfill has to run before this rule deploys: these
    // accounts are only distinguishable from a stranger by the stamp.
    await assertSucceeds(getDoc(doc(as(USERS.legacyEmployee), 'employees', 'doc-legacy')));
  });
});

// ---------------------------------------------------------------------------
// Creating an account for a colleague (the invite flow, src/lib/accountInvites.ts).
//
// The counterpart to G7: removing self-registration left no way to onboard an
// employee, and the way that replaces it must not be able to recreate the
// problem. An administrator creating a profile has to stamp an organisation on
// it — an account belonging to nobody is exactly what G7 was.
// ---------------------------------------------------------------------------
describe('multi-tenancy — an administrator creates accounts in their own org', () => {
  beforeEach(seed);

  const invitee = (over = {}) => ({
    uid: 'invited-1', email: 'invited@example.com', displayName: 'Invited',
    role: 'employee', orgId: 'org-a', superAdmin: false, ...over,
  });

  it('HR creates an account in their own organisation', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'users', 'invited-1'), invitee()));
  });

  it('HR cannot create one in another organisation', async () => {
    await assertFails(setDoc(doc(as(USERS.hrB), 'users', 'invited-1'), invitee({ orgId: 'org-a' })));
  });

  it('nobody can create an account with no organisation', async () => {
    // The G7 shape, arriving by a different route.
    const { orgId, ...noOrg } = invitee();
    await assertFails(setDoc(doc(as(USERS.hrA), 'users', 'invited-1'), noOrg));
    await assertFails(setDoc(doc(as(USERS.superA), 'users', 'invited-1'), noOrg));
  });

  it('HR cannot mint an admin or a super admin', async () => {
    await assertFails(setDoc(doc(as(USERS.hrA), 'users', 'invited-1'), invitee({ role: 'admin' })));
    await assertFails(setDoc(doc(as(USERS.hrA), 'users', 'invited-1'), invitee({ superAdmin: true })));
  });

  it('a manager or employee cannot create an account at all', async () => {
    await assertFails(setDoc(doc(as(USERS.managerA), 'users', 'invited-1'), invitee()));
    await assertFails(setDoc(doc(as(USERS.employeeA), 'users', 'invited-1'), invitee()));
  });

  it('the invite links the account to an employee record in the same org', async () => {
    // In the order inviteAccount writes them: the profile first, then the link.
    // The link rule requires the account to exist and to be in the writer's
    // organisation — a link for a uid with no profile is a link to nobody, and
    // was the shape that let one tenant's HR rewrite another tenant's account.
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'users', 'invited-1'), invitee()));
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'employee_links', 'invited-1'), {
      uid: 'invited-1', employeeId: 'emp-a', orgId: 'org-a', linkedBy: USERS.hrA.uid,
    }));
  });

  it('a self-created profile still carries no organisation, and still may not', async () => {
    // Sign-in's own upsert. It must not name an org — that would be a
    // self-service tenant switch — and the account reads nothing until an
    // administrator assigns it.
    await assertFails(setDoc(doc(as(UNASSIGNED), 'users', UNASSIGNED.uid), {
      uid: UNASSIGNED.uid, email: UNASSIGNED.email, displayName: 'x',
      role: 'employee', orgId: 'org-a',
    }));
  });
});

// ---------------------------------------------------------------------------
// Per-organisation feature flags.
//
// One Firebase project means a code change reaches every tenant at once, so
// staging a rollout has to be expressed in data. The flags live on the
// organisation record: readable by that organisation so its own sessions can
// act on them, writable by super admins only, because which tenants a change
// has reached is a platform decision and not a tenant preference.
// ---------------------------------------------------------------------------
describe('multi-tenancy — feature flags on the organisation record', () => {
  beforeEach(seed);

  it('a member reads their own organisation record', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'organizations', 'org-a')));
  });

  it("a member cannot read another organisation's record", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'organizations', 'org-a')));
    await assertFails(getDoc(doc(as(USERS.hrB), 'organizations', 'org-a')));
  });

  it('a legacy account is not denied outright by the org read', async () => {
    // Was `myProfile().orgId == orgId`, which *errors* for an account with no
    // orgId — a missing map key fails evaluation rather than reading as null —
    // so every legacy account was refused instead of merely not matching.
    // Nothing here dereferences `resource`, so an absent record is a clean miss.
    await assertSucceeds(getDoc(doc(as(USERS.legacyEmployee), 'organizations', 'default')));
    await assertFails(getDoc(doc(as(USERS.legacyEmployee), 'organizations', 'org-a')));
  });

  it('HR cannot turn a feature on, even for their own organisation', async () => {
    // Which tenants a change has reached is not theirs to decide.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'organizations', 'org-a'),
        { features: { somethingNew: true } }, { merge: true }),
    );
  });

  it('an employee cannot turn a feature on', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'organizations', 'org-a'),
        { features: { somethingNew: true } }, { merge: true }),
    );
  });

  it('a super admin sets a flag on any organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.superA), 'organizations', 'org-a'),
        { features: { somethingNew: true } }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(doc(as(USERS.superA), 'organizations', 'org-b'),
        { features: { somethingNew: false } }, { merge: true }),
    );
  });
});

describe('multi-tenancy — access mappings stay inside one organisation', () => {
  beforeEach(seed);

  it("HR of org B cannot link an account to an org A employee", async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'employee_links', USERS.employeeA.uid), {
        uid: USERS.employeeA.uid, employeeId: 'emp-a', orgId: 'org-a', linkedBy: USERS.hrB.uid,
      }),
    );
  });

  it('HR links an account inside their own organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'employee_links', USERS.employeeA.uid), {
        uid: USERS.employeeA.uid, employeeId: 'emp-a', orgId: 'org-a', linkedBy: USERS.hrA.uid,
      }),
    );
  });

  it("HR of org B cannot assign a role into org A", async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'role_assignments', 'someone@example.com'), {
        email: 'someone@example.com', role: 'hr', orgId: 'org-a', assignedBy: USERS.hrB.uid,
      }),
    );
  });

  it("the 'default' sentinel and an absent orgId are the same tenant", async () => {
    // G4: these two collections used to compare against the nullable
    // `myOrgId()` while every other collection compared the 'default'-sentinel
    // `myOrgKey()`. Both spellings must resolve to the legacy tenant, or
    // stamping the sentinel during the backfill would lock its own author out.
    await assertSucceeds(
      setDoc(doc(as(USERS.legacyAdmin), 'employee_links', USERS.legacyEmployee.uid), {
        uid: USERS.legacyEmployee.uid, employeeId: 'emp-legacy', orgId: 'default',
        linkedBy: USERS.legacyAdmin.uid,
      }),
    );
    // The same question asked of the *account* rather than the link document:
    // legacy-2's profile carries no orgId at all, and must still read as the
    // legacy tenant for its own administrator. (The link rule resolves the
    // target account's org, so this account has to exist to be linked.)
    await assertSucceeds(
      setDoc(doc(as(USERS.legacyAdmin), 'users', 'legacy-2'), {
        uid: 'legacy-2', email: 'legacy-2@example.com', displayName: 'Legacy 2',
        role: 'employee', orgId: 'default',
      }),
    );
    await assertSucceeds(
      setDoc(doc(as(USERS.legacyAdmin), 'employee_links', 'legacy-2'), {
        uid: 'legacy-2', employeeId: 'emp-legacy-2', linkedBy: USERS.legacyAdmin.uid,
      }),
    );
    // …and neither spelling is a way into a real organisation.
    await assertFails(
      setDoc(doc(as(USERS.legacyAdmin), 'employee_links', USERS.employeeA.uid), {
        uid: USERS.employeeA.uid, employeeId: 'emp-a', orgId: 'org-a',
        linkedBy: USERS.legacyAdmin.uid,
      }),
    );
  });
});
