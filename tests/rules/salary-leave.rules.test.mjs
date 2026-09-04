/**
 * Salary and leave access-control tests.
 *
 * Three things are asserted here, and none of them is visible to the E2E suite:
 *
 *   1. Salary is no longer readable company-wide. `payslips` used to be
 *      `allow read: if isSignedIn()`, so every employee could read every
 *      colleague's gross, deductions and net pay.
 *   2. "Your own record" actually works. It could not before: documents are
 *      keyed `emp-001` while rules see a Firebase uid, so the
 *      `resource.data.employeeId == request.auth.uid` checks in this file have
 *      never once evaluated true. /employee_links is what connects them.
 *   3. A manager sees their own reports and no further, via the denormalised
 *      `managerChainIds` — not every employee in the company.
 *
 * The single most important test is `an employee cannot author their own link`:
 * every read permission below rests on that document being administrator-
 * authored. If a user can write their own, they point it at the CEO's
 * employeeId and read that salary.
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

// org-a reporting tree:  ceo-a  ->  manager-a  ->  employee-a
// `linkedEmployeeId` is what /employee_links points the account at.
const USERS = {
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  ceoA: { uid: 'ceo-a', email: 'ceo-a@example.com', role: 'manager', orgId: 'org-a', linkedEmployeeId: 'emp-ceo' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a', linkedEmployeeId: 'emp-mgr' },
  // A second manager with reports of their own, elsewhere in the tree.
  otherManagerA: { uid: 'other-manager-a', email: 'other-manager-a@example.com', role: 'manager', orgId: 'org-a', linkedEmployeeId: 'emp-other-mgr' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', linkedEmployeeId: 'emp-001' },
  colleagueA: { uid: 'colleague-a', email: 'colleague-a@example.com', role: 'employee', orgId: 'org-a', linkedEmployeeId: 'emp-002' },
  // Deliberately has no /employee_links document.
  unlinkedA: { uid: 'unlinked-a', email: 'unlinked-a@example.com', role: 'employee', orgId: 'org-a' },
};

// emp-001 reports to emp-mgr reports to emp-ceo. emp-002 reports to nobody.
const CHAIN_001 = ['emp-mgr', 'emp-ceo'];

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
        orgId: user.orgId,
      });
      if (user.linkedEmployeeId) {
        await setDoc(doc(db, 'employee_links', user.uid), {
          uid: user.uid,
          employeeId: user.linkedEmployeeId,
          orgId: user.orgId,
          linkedBy: 'admin-a',
        });
      }
    }

    await setDoc(doc(db, 'employee_compensation', 'emp-001'), { employeeId: 'emp-001', orgId: 'org-a', ctc: 1200000 });
    await setDoc(doc(db, 'employee_compensation', 'emp-002'), { employeeId: 'emp-002', orgId: 'org-a', ctc: 900000 });

    await setDoc(doc(db, 'payslips', 'emp-001_2026-05'), {
      employeeId: 'emp-001', orgId: 'org-a', month: '2026-05', netPay: 82000,
    });
    await setDoc(doc(db, 'payslips', 'emp-002_2026-05'), {
      employeeId: 'emp-002', orgId: 'org-a', month: '2026-05', netPay: 61000,
    });

    await setDoc(doc(db, 'leave_requests', 'lr-001'), {
      employeeId: 'emp-001', orgId: 'org-a', type: 'Casual', status: 'Pending', days: 2,
      managerChainIds: CHAIN_001,
    });
    await setDoc(doc(db, 'leave_requests', 'lr-002'), {
      employeeId: 'emp-002', orgId: 'org-a', type: 'Sick', status: 'Pending', days: 1,
      managerChainIds: [],
    });

    await setDoc(doc(db, 'leave_balances', 'emp-001_Casual'), {
      employeeId: 'emp-001', orgId: 'org-a', type: 'Casual', total: 12, used: 2, available: 10,
      managerChainIds: CHAIN_001,
    });
  });
}

// ---------------------------------------------------------------------------
// The foundation
// ---------------------------------------------------------------------------

describe('employee_links — the write rule everything rests on', () => {
  beforeEach(seed);

  it('an employee cannot author their own link', async () => {
    // The escalation this whole design exists to prevent: pointing your own
    // account at another employee's record to read their salary.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'employee_links', USERS.employeeA.uid), {
        uid: USERS.employeeA.uid, employeeId: 'emp-ceo', orgId: 'org-a', linkedBy: 'self',
      }),
    );
  });

  it('an employee cannot author somebody else’s link', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'employee_links', USERS.colleagueA.uid), {
        uid: USERS.colleagueA.uid, employeeId: 'emp-999', orgId: 'org-a', linkedBy: 'self',
      }),
    );
  });

  it('a manager cannot author a link', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'employee_links', USERS.employeeA.uid), {
        uid: USERS.employeeA.uid, employeeId: 'emp-ceo', orgId: 'org-a', linkedBy: 'mgr',
      }),
    );
  });

  it('HR can link an account within their own organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'employee_links', USERS.unlinkedA.uid), {
        uid: USERS.unlinkedA.uid, employeeId: 'emp-003', orgId: 'org-a', linkedBy: USERS.hrA.uid,
      }),
    );
  });

  it('HR cannot link an account into another organisation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'employee_links', USERS.unlinkedA.uid), {
        uid: USERS.unlinkedA.uid, employeeId: 'emp-003', orgId: 'org-a', linkedBy: USERS.hrB.uid,
      }),
    );
  });

  it('a link cannot be filed under one uid while naming another', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'employee_links', USERS.unlinkedA.uid), {
        uid: USERS.employeeA.uid, employeeId: 'emp-003', orgId: 'org-a', linkedBy: USERS.hrA.uid,
      }),
    );
  });

  it('an employee can read their own link but not a colleague’s', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'employee_links', USERS.employeeA.uid)));
    await assertFails(getDoc(doc(as(USERS.employeeA), 'employee_links', USERS.colleagueA.uid)));
  });
});

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

describe('salary — compensation and payslips', () => {
  beforeEach(seed);

  it('an employee reads their own compensation', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'employee_compensation', 'emp-001')));
  });

  it('an employee cannot read a colleague’s compensation', async () => {
    await assertFails(getDoc(doc(as(USERS.employeeA), 'employee_compensation', 'emp-002')));
  });

  it('an account with no link reads nobody’s compensation', async () => {
    // Fails closed: no link means myEmployeeId() is null, so isSelf() is false
    // for every record rather than matching something by accident.
    await assertFails(getDoc(doc(as(USERS.unlinkedA), 'employee_compensation', 'emp-001')));
  });

  it('a manager cannot read a direct report’s compensation', async () => {
    // Deliberate: having reports does not entitle someone to their pay, which
    // is why managesSubject() is absent from the salary rules.
    await assertFails(getDoc(doc(as(USERS.managerA), 'employee_compensation', 'emp-001')));
  });

  it('HR reads any compensation in the organisation', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'employee_compensation', 'emp-001')));
  });

  it('an employee reads their own payslip but not a colleague’s', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'payslips', 'emp-001_2026-05')));
    await assertFails(getDoc(doc(as(USERS.employeeA), 'payslips', 'emp-002_2026-05')));
  });

  it('an employee lists their own payslips, filtered', async () => {
    await assertSucceeds(
      getDocs(query(
        collection(as(USERS.employeeA), 'payslips'),
        where('orgId', '==', 'org-a'),
        where('employeeId', '==', 'emp-001'),
      )),
    );
  });

  it('an employee cannot list payslips unfiltered', async () => {
    // The regression that reopens the leak: an unconstrained list would return
    // colleagues' payslips, so the whole query must fail.
    await assertFails(getDocs(collection(as(USERS.employeeA), 'payslips')));
  });

  it('an employee cannot list a colleague’s payslips by filtering for them', async () => {
    await assertFails(
      getDocs(query(
        collection(as(USERS.employeeA), 'payslips'),
        where('orgId', '==', 'org-a'),
        where('employeeId', '==', 'emp-002'),
      )),
    );
  });

  it('a manager cannot list payslips', async () => {
    await assertFails(getDocs(collection(as(USERS.managerA), 'payslips')));
  });

  it('HR lists all payslips in their organisation', async () => {
    await assertSucceeds(
      getDocs(query(collection(as(USERS.hrA), 'payslips'), where('orgId', '==', 'org-a'))),
    );
  });

  it('an employee cannot write their own compensation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'employee_compensation', 'emp-001'), {
        employeeId: 'emp-001', orgId: 'org-a', ctc: 9999999,
      }),
    );
  });

  it('a manager cannot write compensation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'employee_compensation', 'emp-001'), {
        employeeId: 'emp-001', orgId: 'org-a', ctc: 9999999,
      }),
    );
  });

  it('HR writes compensation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'employee_compensation', 'emp-001'), {
        employeeId: 'emp-001', orgId: 'org-a', ctc: 1300000,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

describe('leave — own records, and a manager’s own reports', () => {
  beforeEach(seed);

  it('an employee reads their own leave request', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'leave_requests', 'lr-001')));
  });

  it('an employee cannot read a colleague’s leave request', async () => {
    await assertFails(getDoc(doc(as(USERS.employeeA), 'leave_requests', 'lr-002')));
  });

  it('a direct manager reads their report’s leave request', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.managerA), 'leave_requests', 'lr-001')));
  });

  it('a skip-level manager reads it too', async () => {
    // emp-ceo is above emp-mgr, so the whole subtree is in scope — the chain is
    // every level up, not just the immediate manager.
    await assertSucceeds(getDoc(doc(as(USERS.ceoA), 'leave_requests', 'lr-001')));
  });

  it('a manager elsewhere in the tree cannot read it', async () => {
    // The limit this fixes: before managerChainIds, any isManager() account
    // could read every leave record in the company.
    await assertFails(getDoc(doc(as(USERS.otherManagerA), 'leave_requests', 'lr-001')));
  });

  it('a manager lists their reports’ requests via the chain', async () => {
    await assertSucceeds(
      getDocs(query(
        collection(as(USERS.managerA), 'leave_requests'),
        where('orgId', '==', 'org-a'),
        where('managerChainIds', 'array-contains', 'emp-mgr'),
      )),
    );
  });

  it('a manager cannot list leave requests unfiltered', async () => {
    await assertFails(getDocs(collection(as(USERS.managerA), 'leave_requests')));
  });

  it('an employee lists their own requests, filtered', async () => {
    await assertSucceeds(
      getDocs(query(
        collection(as(USERS.employeeA), 'leave_requests'),
        where('orgId', '==', 'org-a'),
        where('employeeId', '==', 'emp-001'),
      )),
    );
  });

  it('an employee cannot list leave requests unfiltered', async () => {
    await assertFails(getDocs(collection(as(USERS.employeeA), 'leave_requests')));
  });

  it('HR lists every leave request in their organisation', async () => {
    await assertSucceeds(
      getDocs(query(collection(as(USERS.hrA), 'leave_requests'), where('orgId', '==', 'org-a'))),
    );
  });

  it('an employee reads their own leave balance, not a colleague’s', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'leave_balances', 'emp-001_Casual')));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leave_balances', 'emp-002_Casual'), {
        employeeId: 'emp-002', orgId: 'org-a', type: 'Casual', total: 12, used: 0, available: 12, managerChainIds: [],
      });
    });
    await assertFails(getDoc(doc(as(USERS.employeeA), 'leave_balances', 'emp-002_Casual')));
  });

  it('an employee cannot grant themselves leave days', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'leave_balances', 'emp-001_Casual'), {
        employeeId: 'emp-001', orgId: 'org-a', type: 'Casual', total: 99, used: 0, available: 99, managerChainIds: CHAIN_001,
      }),
    );
  });

  it('a manager cannot write a leave balance', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'leave_balances', 'emp-001_Casual'), {
        employeeId: 'emp-001', orgId: 'org-a', type: 'Casual', total: 99, used: 0, available: 99, managerChainIds: CHAIN_001,
      }),
    );
  });

  it('HR writes a leave balance', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'leave_balances', 'emp-001_Casual'), {
        employeeId: 'emp-001', orgId: 'org-a', type: 'Casual', total: 15, used: 2, available: 13, managerChainIds: CHAIN_001,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Organisation isolation
// ---------------------------------------------------------------------------

describe('salary and leave — organisation isolation', () => {
  beforeEach(seed);

  it("another org's HR can no longer read this org's compensation", async () => {
    // Previously recorded here as a KNOWN GAP: these records carried no orgId,
    // so isOrgAdmin() alone admitted any organisation's HR. Closed by the
    // org-scoped rules — see tests/rules/multitenancy.rules.test.mjs.
    await assertFails(getDoc(doc(as(USERS.hrB), 'employee_compensation', 'emp-001')));
  });
});
