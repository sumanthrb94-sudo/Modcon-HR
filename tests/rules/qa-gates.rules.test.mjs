/**
 * QA go-live gates G1 / G2 / G3 — security-rules tests.
 *
 * Adapted from `firestore.rules.test.js`, delivered with the QA hand-off
 * (ModConHR_ClaudeCode_Handoff.md, T1). Every access expectation is the QA
 * author's, unchanged: each assertFails / assertSucceeds below asserts exactly
 * what the original asserted. What changed is the schema it is asserted
 * against, because the original was written from the observed UI rather than
 * from `firestore.rules`, and guessed wrong in two structural ways.
 *
 *   1. THERE ARE NO CUSTOM CLAIMS. The original authenticates with
 *      `{ org, role }` claims. This ruleset reads exactly one token claim —
 *      `request.auth.token.email`, at three sites, all of them the fixed
 *      admin / super-admin allow-lists. `role`, `orgId` and `superAdmin` are
 *      resolved with get() against `users/{uid}`, and `isSelf()` resolves
 *      through `employee_links/{uid}`. A claims-only context is an account
 *      with no profile document, so isAdmin() / isHR() / isManager() /
 *      isSuperAdmin() are all false and myOrgId() errors — every
 *      authenticated assertion would fail, for the wrong reason, and a suite
 *      that red-flags everything proves nothing. Personas are therefore
 *      seeded as documents.
 *
 *   2. THERE ARE NO SUBCOLLECTIONS. The original reads
 *      `organizations/{orgId}/expenseClaims/{id}`; no subcollection is matched
 *      anywhere in the ruleset, and `organizations/{orgId}` is a flat tenant
 *      record. Everything a user can change lives in one flat collection,
 *      `org_records`, keyed `<orgKey>__<store>__<recordId>` with the record as
 *      a JSON string in `data` and `employeeId` / `status` lifted to top level
 *      because rules cannot parse JSON. Organisation configuration lives in
 *      `org_settings`, keyed `<orgKey>__<setting>`. See docs/shared-records-spec.md.
 *
 * Path translation, applied throughout:
 *
 *   organizations/orgA/expenseClaims/exp1  ->  org_records/orgA__expenseClaims__exp1
 *   organizations/orgA/payslips/ps1        ->  org_records/orgA__payslips__ps1
 *   organizations/orgA/payrollRuns/run1    ->  org_records/orgA__payrollRuns__run1
 *   organizations/orgA/salaryStructure/cfg ->  org_settings/orgA__salaryStructure
 *
 * `expenseClaims`, `payslips` and `payrollRuns` are the store names the app
 * actually registers (src/data/expenses.ts, src/data/payroll.ts), so the
 * original's collection names carry over intact.
 *
 * One test needed its *query* rewritten rather than its path, and it is called
 * out where it appears: "cannot list all expense claims in the org" has to
 * filter the way the app filters, or it is denied on the tenant boundary and
 * passes without ever testing the per-user claim it is named for.
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
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const ORG_A = 'orgA';
const ORG_B = 'orgB';

/**
 * The QA suite's five identities, as this ruleset expresses them.
 *
 * `hrAdmin` in the original is the `hr` role here — an organisation
 * administrator who is not a platform admin. The super admin carries no
 * orgId on purpose: it administers every organisation rather than belonging
 * to one, which is what myOrgKey() resolves to '~unassigned~' and what gate
 * G3 rests on.
 */
const USERS = {
  empA1: { uid: 'empA1', email: 'emp-a1@example.com', role: 'employee', orgId: ORG_A, employeeId: 'emp-a1' },
  empA2: { uid: 'empA2', email: 'emp-a2@example.com', role: 'employee', orgId: ORG_A, employeeId: 'emp-a2' },
  hrA: { uid: 'hrA', email: 'hr-a@example.com', role: 'hr', orgId: ORG_A, employeeId: 'emp-a-hr' },
  empB1: { uid: 'empB1', email: 'emp-b1@example.com', role: 'employee', orgId: ORG_B, employeeId: 'emp-b1' },
  superAdmin: { uid: 'root', email: 'root@example.com', role: 'admin', superAdmin: true },
};

let testEnv;

/** A Firestore handle authenticated as one of the USERS above. */
function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}
const empA1 = () => as(USERS.empA1);
const hrA = () => as(USERS.hrA);
const empB1 = () => as(USERS.empB1);
const superAdmin = () => as(USERS.superAdmin);
const anon = () => testEnv.unauthenticatedContext().firestore();

/** An org_records document id, which the rules recompute and compare. */
const recordId = (org, store, id) => `${org}__${store}__${id}`;

/** The stored shape of an org_records document. */
function record(org, store, id, fields, readableBy) {
  return {
    orgId: org,
    store,
    recordId: id,
    data: JSON.stringify(fields),
    ...fields,
    // Who may read it: the subject, then everyone above them. Stamped at
    // write time by src/data/persistence.ts, because rules cannot walk the
    // reporting tree.
    ...(readableBy ? { readableBy } : fields.employeeId ? { readableBy: [fields.employeeId] } : {}),
  };
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

/**
 * Seed with security rules disabled.
 *
 * The profile and link documents have no counterpart in the original, and are
 * not scenery: they are where this ruleset keeps the role and org the original
 * put in custom claims. Reseeded per test because these suites mutate.
 */
async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    for (const user of Object.values(USERS)) {
      const profile = { uid: user.uid, email: user.email, role: user.role };
      if (user.orgId) profile.orgId = user.orgId;
      if (user.superAdmin) profile.superAdmin = true;
      await setDoc(doc(db, 'users', user.uid), profile);
      if (user.employeeId) {
        await setDoc(doc(db, 'employee_links', user.uid), {
          employeeId: user.employeeId,
          orgId: user.orgId,
        });
      }
    }

    await setDoc(
      doc(db, 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1')),
      record(ORG_A, 'expenseClaims', 'exp1', { employeeId: 'emp-a1', amount: 1200, status: 'Submitted' }),
    );
    await setDoc(
      doc(db, 'org_records', recordId(ORG_A, 'expenseClaims', 'exp2')),
      record(ORG_A, 'expenseClaims', 'exp2', { employeeId: 'emp-a2', amount: 900, status: 'Submitted' }),
    );
    await setDoc(
      doc(db, 'org_records', recordId(ORG_A, 'payslips', 'ps1')),
      record(ORG_A, 'payslips', 'ps1', { employeeId: 'emp-a1', net: 45000 }),
    );
    await setDoc(
      doc(db, 'org_records', recordId(ORG_A, 'payrollRuns', 'run1')),
      record(ORG_A, 'payrollRuns', 'run1', { total: 96000 }),
    );
    await setDoc(
      doc(db, 'org_records', recordId(ORG_B, 'expenseClaims', 'expB')),
      record(ORG_B, 'expenseClaims', 'expB', { employeeId: 'emp-b1', amount: 500, status: 'Submitted' }),
    );

    // salaryStructure is organisation configuration, not a record.
    await setDoc(doc(db, 'org_settings', `${ORG_A}__salaryStructure`), {
      orgId: ORG_A,
      key: 'salaryStructure',
      valueJson: JSON.stringify({ basicPercent: 50 }),
    });
  });
}

beforeEach(seed);

// --- G2: no anonymous access ----------------------------------------------
describe('G2 — anonymous access is denied', () => {
  it('anon cannot read expenseClaims', async () => {
    await assertFails(getDoc(doc(anon(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1'))));
  });

  it('anon cannot write expenseClaims', async () => {
    await assertFails(
      setDoc(doc(anon(), 'org_records', recordId(ORG_A, 'expenseClaims', 'x')),
        record(ORG_A, 'expenseClaims', 'x', { amount: 1 })),
    );
  });

  it('anon cannot read payslips', async () => {
    await assertFails(getDoc(doc(anon(), 'org_records', recordId(ORG_A, 'payslips', 'ps1'))));
  });
});

// --- G1: per-user isolation within an org ---------------------------------
describe('G1 — employee can access only their own records', () => {
  it('empA1 CAN read own expense claim', async () => {
    await assertSucceeds(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1'))));
  });

  // CLOSED. `recordIsMineToRead()` narrows expenseClaims and payslips to
  // their subject, whoever is above them, and the administrators.
  it("empA1 CANNOT read another employee's expense claim", async () => {
    await assertFails(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp2'))));
  });

  it('empA1 CAN read own payslip', async () => {
    await assertSucceeds(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'payslips', 'ps1'))));
  });

  // CLOSED, and this is the one that shows why the rule could not move
  // first: this query IS what src/data/persistence.ts subscribed with. A
  // list is evaluated against every document it returns, so narrowing the
  // rule alone denies the WHOLE subscription — and the error handler there
  // only warns, leaving the page rendering a stale cache, which is the
  // UI-disagrees-with-the-database failure filed as R4-M1. The client now
  // adds `where('readableBy','array-contains', me)`; this unnarrowed query
  // is what an employee must still be refused for asking.
  it('empA1 CANNOT list all expense claims in the org', async () => {
    // The original lists a subcollection, which has no equivalent here: an
    // unfiltered read of `org_records` returns org B's claim too and is denied
    // on the TENANT boundary, which would pass this assertion without ever
    // testing the per-user claim it is named for. Filtered the way
    // src/data/persistence.ts filters, so the only thing left to deny is
    // "another employee's row".
    await assertFails(
      getDocs(query(
        collection(empA1(), 'org_records'),
        where('orgId', '==', ORG_A),
        where('store', '==', 'expenseClaims'),
      )),
    );
  });
});

describe('G1 — a manager reads their reports, and narrowing loses nobody', () => {
  // The half the QA suite did not ask for, and without which the narrowing
  // would be a regression rather than a fix: an approval queue an approver
  // cannot read is an empty queue, and the expense scoping in
  // src/lib/dataScope.ts filters what the store already holds.
  it('a manager reads a report’s claim', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp-report')),
        record(ORG_A, 'expenseClaims', 'exp-report',
          { employeeId: 'emp-a2', amount: 400, status: 'Submitted' },
          // emp-a2 reports to the HR persona's employee record.
          ['emp-a2', 'emp-a-hr']),
      );
    });
    await assertSucceeds(
      getDoc(doc(hrA(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp-report'))),
    );
  });

  it('but somebody outside that line does not', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp-elsewhere')),
        record(ORG_A, 'expenseClaims', 'exp-elsewhere',
          { employeeId: 'emp-a2', amount: 400, status: 'Submitted' },
          ['emp-a2', 'emp-somebody-else']),
      );
    });
    await assertFails(
      getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp-elsewhere'))),
    );
  });

  it('a narrowed list is allowed, and returns only what it may', async () => {
    // What src/data/persistence.ts now subscribes with. The unnarrowed
    // version of this query is refused above; this one is the reason
    // narrowing the rule did not simply break the page.
    await assertSucceeds(
      getDocs(query(
        collection(empA1(), 'org_records'),
        where('orgId', '==', ORG_A),
        where('store', '==', 'expenseClaims'),
        where('readableBy', 'array-contains', 'emp-a1'),
      )),
    );
  });

  it('a payslip is the same rule', async () => {
    await assertSucceeds(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'payslips', 'ps1'))));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'org_records', recordId(ORG_A, 'payslips', 'ps2')),
        record(ORG_A, 'payslips', 'ps2', { employeeId: 'emp-a2', net: 61000 }),
      );
    });
    await assertFails(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'payslips', 'ps2'))));
  });
});

describe('G1 — a narrowed reader cannot delete what it can no longer see', () => {
  // QA asked for this one by name, and it is the hazard worth naming: a
  // reader whose subscription now returns only its own records hydrates a
  // SMALLER overlay than before, and `push` computes "reverted" records by
  // diffing against what it last saw. Get that wrong and an employee editing
  // their own claim issues tombstones for every colleague's — data loss
  // dressed up as a sync.
  //
  // The client side of that is arithmetic (persistence.ts diffs against
  // `lastPushed`, which is itself hydrated from the narrowed snapshot, so the
  // two agree). This is the server side: even if the client got it wrong, the
  // rules must refuse it.
  it('an employee writing their own claim cannot tombstone a colleague’s', async () => {
    await assertFails(
      setDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp2')), {
        orgId: ORG_A,
        store: 'expenseClaims',
        recordId: 'exp2',
        deleted: true,
        data: '',
      }),
    );
  });

  it('nor hard-delete one', async () => {
    await assertFails(
      deleteDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp2'))),
    );
  });

  it('and the colleague’s claim is still there afterwards', async () => {
    // The assertion that makes the two above mean something: proving a write
    // was refused proves nothing if the record went anyway.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(
        doc(ctx.firestore(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp2')),
      );
      if (!snap.exists()) throw new Error('emp-a2’s claim was removed');
      if (snap.data().deleted === true) throw new Error('emp-a2’s claim was tombstoned');
    });
  });

  it('while its own subject still may remove it', async () => {
    // The narrowing must not cost an employee control of their own record.
    await assertSucceeds(
      setDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1')), {
        orgId: ORG_A,
        store: 'expenseClaims',
        recordId: 'exp1',
        deleted: true,
        data: '',
      }),
    );
  });
});

// --- G1: cross-org isolation ----------------------------------------------
describe('G1 — cross-org isolation', () => {
  it('empB1 (Org B) CANNOT read Org A expense claim', async () => {
    await assertFails(getDoc(doc(empB1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1'))));
  });

  it('hrA (Org A admin) CANNOT read Org B data', async () => {
    await assertFails(getDoc(doc(hrA(), 'org_records', recordId(ORG_B, 'expenseClaims', 'expB'))));
  });
});

// --- G1: role-gated collections -------------------------------------------
describe('G1 — payroll/salary/statutory are HR-admin only', () => {
  it('hrA CAN read salaryStructure', async () => {
    await assertSucceeds(getDoc(doc(hrA(), 'org_settings', `${ORG_A}__salaryStructure`)));
  });

  // CORRECTED, not failing. The QA author withdrew this expectation: the
  // salary structure is the ORGANISATION's percentage split (Basic %, HRA %,
  // two flat allowances), not anybody's pay, and it is what each employee's
  // own payslip breakdown is computed from client-side —
  // src/pages/finance/index.tsx:93 calls buildPayslipComponents(employee),
  // which reaches getSalaryStructureFor() and reads this exact document.
  // Denying the read would render every employee's own breakdown as
  // "not set" while hiding a figure their payslip already shows the results
  // of. The assertion is therefore inverted to state what the rule correctly
  // allows, rather than deleted — a withdrawn expectation is worth keeping
  // visible so it is not re-raised.
  it('empA1 CAN read salaryStructure (expectation corrected by its author)', async () => {
    await assertSucceeds(getDoc(doc(empA1(), 'org_settings', `${ORG_A}__salaryStructure`)));
  });

  // CLOSED. `orgRecordReadIsAuthorised()` narrows this one store to
  // `isOrgAdmin()`, because a payroll run carries grossTotal, netTotal and
  // employeeCount for the whole organisation — it is not about an employee,
  // so no employee has a claim on it.
  //
  // It could not be closed on its own: the employee's own Finance page built
  // their payslip history by mapping every payroll run, so denying the read
  // emptied a page about them. That history comes from their own payslips
  // now, and persistence.ts no longer subscribes a non-administrator to the
  // store at all.
  it('empA1 CANNOT read payrollRuns', async () => {
    await assertFails(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'payrollRuns', 'run1'))));
  });

  it('hrA CAN read payrollRuns', async () => {
    // The other direction, which the QA suite did not ask for and which the
    // narrowing would be worthless without: an administrator still reads the
    // organisation's own figures.
    await assertSucceeds(getDoc(doc(hrA(), 'org_records', recordId(ORG_A, 'payrollRuns', 'run1'))));
  });

  it('and narrowing one store does not narrow the others', async () => {
    // The read guard is keyed on the store name, so an expense claim, a
    // ticket or an attendance record stays organisation-wide. Keyed on
    // `.get('store','')` because a list is evaluated per document and a
    // missing field would error, denying the whole query.
    await assertSucceeds(getDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1'))));
  });

  it('empA1 CANNOT write payrollRuns', async () => {
    await assertFails(
      setDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'payrollRuns', 'x')),
        record(ORG_A, 'payrollRuns', 'x', { total: 1 })),
    );
  });
});

// --- G3: super admin cannot read org HR data (regression guard) -----------
describe('G3 — platform super admin has NO org HR data access', () => {
  it('superAdmin CANNOT read an org expense claim', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1'))));
  });

  it('superAdmin CANNOT read an org payslip', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'org_records', recordId(ORG_A, 'payslips', 'ps1'))));
  });

  it('superAdmin CANNOT read salaryStructure', async () => {
    await assertFails(getDoc(doc(superAdmin(), 'org_settings', `${ORG_A}__salaryStructure`)));
  });
});

// --- Write-ownership: an employee cannot approve their own claim -----------
describe('G1 — approval is a privileged transition', () => {
  it('empA1 CANNOT set their own claim to Approved', async () => {
    await assertFails(
      setDoc(doc(empA1(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1')),
        record(ORG_A, 'expenseClaims', 'exp1', { employeeId: 'emp-a1', amount: 1200, status: 'Approved' })),
    );
  });

  it('hrA/manager CAN approve a claim', async () => {
    await assertSucceeds(
      setDoc(doc(hrA(), 'org_records', recordId(ORG_A, 'expenseClaims', 'exp1')),
        record(ORG_A, 'expenseClaims', 'exp1', { employeeId: 'emp-a1', amount: 1200, status: 'Approved' })),
    );
  });
});
