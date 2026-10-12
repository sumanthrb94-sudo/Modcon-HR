/**
 * Bank-details security-rules tests.
 *
 * The account salary is paid into. The claims the feature rests on, none of
 * which the UI can prove — it only offers the controls it thinks you should
 * have:
 *
 *   1. An employee reads and enters their own details; nobody else's, and no
 *      colleague reads theirs. A manager is not HR here.
 *   2. What an employee submits arrives Pending and unreviewed — they cannot
 *      verify themselves.
 *   3. HR or an administrator verifies or rejects, signed with their own uid.
 *   4. Once verified, the employee cannot change it (product owner,
 *      2026-10-12: "they should consult HR"). HR still can.
 *   5. Malformed numbers and IFSCs are refused, and nothing crosses an org.
 *
 * Run with `npm run test:rules`.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a9' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a1' },
  colleagueA: { uid: 'colleague-a', email: 'colleague-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a2' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
};

const MINE = 'org-a__emp-a1';
let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

function details(overrides = {}) {
  return {
    orgId: 'org-a',
    employeeId: 'emp-a1',
    accountHolderName: 'Employee A',
    accountNumber: '123456789012',
    ifsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    status: 'Pending',
    submittedByUid: USERS.employeeA.uid,
    submittedAt: '2026-10-12T10:00:00.000Z',
    ...overrides,
  };
}

const verified = (overrides = {}) =>
  details({ status: 'Verified', reviewedByUid: USERS.hrA.uid, reviewedAt: '2026-10-12T11:00:00.000Z', ...overrides });

async function put(id, data) {
  await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'employee_bank_details', id), data));
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
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
        uid: user.uid, email: user.email, displayName: user.email, role: user.role, orgId: user.orgId,
      });
      if (user.employeeId) {
        await setDoc(doc(db, 'employee_links', user.uid), {
          uid: user.uid, employeeId: user.employeeId, orgId: user.orgId, linkedBy: 'seed',
        });
      }
    }
  });
}

const mine = (db) => query(collection(db, 'employee_bank_details'), where('orgId', '==', 'org-a'), where('employeeId', '==', 'emp-a1'));

describe('bank details — reading', () => {
  beforeEach(async () => {
    await seed();
    await put(MINE, details());
    await put('org-a__emp-a2', details({ employeeId: 'emp-a2', submittedByUid: USERS.colleagueA.uid }));
  });

  it('the employee reads their own, including before anything is submitted', async () => {
    await assertSucceeds(getDocs(mine(as(USERS.employeeA))));
    await testEnv.clearFirestore();
    await seed();
    await assertSucceeds(getDocs(mine(as(USERS.employeeA))));
  });

  it('a colleague cannot read them', async () => {
    await assertFails(getDocs(mine(as(USERS.colleagueA))));
  });

  it('a manager cannot read them — managers are not HR', async () => {
    await assertFails(getDocs(mine(as(USERS.managerA))));
  });

  it('HR reads everyone in their organisation, and nobody in another', async () => {
    await assertSucceeds(getDocs(query(collection(as(USERS.hrA), 'employee_bank_details'), where('orgId', '==', 'org-a'))));
    await assertFails(getDocs(mine(as(USERS.hrB))));
  });
});

describe('bank details — the employee submitting', () => {
  beforeEach(seed);

  it('submits their own, Pending', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.employeeA), 'employee_bank_details', MINE), details()));
  });

  it('cannot verify themselves', async () => {
    await assertFails(setDoc(doc(as(USERS.employeeA), 'employee_bank_details', MINE),
      verified({ reviewedByUid: USERS.employeeA.uid })));
  });

  it('cannot submit a colleague’s', async () => {
    await assertFails(setDoc(doc(as(USERS.colleagueA), 'employee_bank_details', MINE),
      details({ submittedByUid: USERS.colleagueA.uid })));
  });

  it('cannot forge who submitted', async () => {
    await assertFails(setDoc(doc(as(USERS.employeeA), 'employee_bank_details', MINE),
      details({ submittedByUid: USERS.hrA.uid })));
  });

  it('may correct it while Pending or Rejected', async () => {
    await put(MINE, details({ status: 'Rejected', reviewedByUid: USERS.hrA.uid, reviewedAt: 'x', reviewNote: 'Name mismatch' }));
    await assertSucceeds(setDoc(doc(as(USERS.employeeA), 'employee_bank_details', MINE),
      details({ accountHolderName: 'Employee A Corrected' })));
  });

  it('cannot change it once HR has verified it', async () => {
    await put(MINE, verified());
    await assertFails(setDoc(doc(as(USERS.employeeA), 'employee_bank_details', MINE),
      details({ accountNumber: '999999999999' })));
  });

  it('refuses a malformed account number or IFSC', async () => {
    const db = as(USERS.employeeA);
    await assertFails(setDoc(doc(db, 'employee_bank_details', MINE), details({ accountNumber: '12345' })));
    await assertFails(setDoc(doc(db, 'employee_bank_details', MINE), details({ accountNumber: '12345678901A' })));
    await assertFails(setDoc(doc(db, 'employee_bank_details', MINE), details({ ifsc: 'hdfc0001234' })));
    await assertFails(setDoc(doc(db, 'employee_bank_details', MINE), details({ ifsc: 'HDFC1001234' })));
  });

  it('cannot file it at an id that is not theirs', async () => {
    await assertFails(setDoc(doc(as(USERS.employeeA), 'employee_bank_details', 'org-a__emp-a2'), details()));
  });

  it('cannot delete it', async () => {
    await put(MINE, details());
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'employee_bank_details', MINE)));
  });
});

describe('bank details — HR reviewing', () => {
  beforeEach(async () => {
    await seed();
    await put(MINE, details());
  });

  it('HR verifies, signed with their own uid', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'employee_bank_details', MINE), verified()));
  });

  it('HR cannot verify in somebody else’s name', async () => {
    await assertFails(setDoc(doc(as(USERS.hrA), 'employee_bank_details', MINE),
      verified({ reviewedByUid: USERS.adminA.uid })));
  });

  it('an administrator verifies too', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.adminA), 'employee_bank_details', MINE),
      verified({ reviewedByUid: USERS.adminA.uid })));
  });

  it('a manager cannot verify', async () => {
    await assertFails(setDoc(doc(as(USERS.managerA), 'employee_bank_details', MINE),
      verified({ reviewedByUid: USERS.managerA.uid })));
  });

  it('HR rejects with a note', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'employee_bank_details', MINE),
      details({ status: 'Rejected', reviewedByUid: USERS.hrA.uid, reviewedAt: '2026-10-12T11:00:00.000Z', reviewNote: 'Name mismatch' })));
  });

  it('HR corrects a verified account', async () => {
    await put(MINE, verified());
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'employee_bank_details', MINE),
      verified({ accountNumber: '999999999999', submittedByUid: USERS.hrA.uid })));
  });

  it('HR in another organisation can do none of it', async () => {
    await assertFails(setDoc(doc(as(USERS.hrB), 'employee_bank_details', MINE),
      verified({ reviewedByUid: USERS.hrB.uid })));
  });
});
