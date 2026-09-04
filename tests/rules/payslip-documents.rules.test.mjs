/**
 * Uploaded-payslip security-rules tests.
 *
 * A payslip PDF is somebody's salary. The claims this file checks are the ones
 * the feature rests on, and not one of them is testable through the UI — the
 * client hides the upload control from non-HR and only ever queries its own
 * employee id, so an E2E run would pass just as happily if the rules let a
 * colleague read every payslip in the company:
 *
 *   1. An employee reads their own payslip and nobody else's — including
 *      nobody else's in their own organisation.
 *   2. Only org administrators upload, and only into their own organisation.
 *   3. The uploader cannot be forged, and the payload has to be a bounded PDF,
 *      or the document exceeds Firestore's 1 MiB ceiling.
 *   4. A manager is not an administrator here. Managers approve leave; they do
 *      not get their reports' salaries.
 *
 * "Their own" means the `employee_links/{uid}` document, which only an
 * administrator can write — the client's claim about who it is carries no
 * weight (see src/data/employeeLinks.ts).
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
import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a' },
  // employeeA is linked to emp-a1, colleagueA to emp-a2 — both in org-a.
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a1' },
  colleagueA: { uid: 'colleague-a', email: 'colleague-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a2' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b', employeeId: 'emp-b1' },
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

/** A valid payslip payload, overridable per test. */
function payslip(overrides = {}) {
  return {
    id: 'org-a__emp-a1__2026-07',
    orgId: 'org-a',
    employeeId: 'emp-a1',
    employeeCode: 'MC-A1',
    month: '2026-07',
    fileName: 'MC-A1-july.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    contentBase64: 'JVBERi0xLjQK',
    uploadedAt: '2026-08-01T10:00:00.000Z',
    uploadedByUid: USERS.hrA.uid,
    uploadedByName: 'HR A',
    ...overrides,
  };
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

/** Reseed profiles, employee links and three payslips, bypassing rules. */
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
      if (user.employeeId) {
        await setDoc(doc(db, 'employee_links', user.uid), {
          uid: user.uid,
          employeeId: user.employeeId,
          orgId: user.orgId,
          linkedBy: 'seed',
        });
      }
    }
    await setDoc(doc(db, 'payslip_documents', 'org-a__emp-a1__2026-07'), payslip());
    await setDoc(
      doc(db, 'payslip_documents', 'org-a__emp-a2__2026-07'),
      payslip({ id: 'org-a__emp-a2__2026-07', employeeId: 'emp-a2', employeeCode: 'MC-A2' }),
    );
    await setDoc(
      doc(db, 'payslip_documents', 'org-b__emp-b1__2026-07'),
      payslip({
        id: 'org-b__emp-b1__2026-07',
        orgId: 'org-b',
        employeeId: 'emp-b1',
        employeeCode: 'MC-B1',
        uploadedByUid: USERS.hrB.uid,
      }),
    );
  });
}

describe('uploaded payslips — who may read them', () => {
  beforeEach(seed);

  it('an employee reads their own payslip', async () => {
    await assertSucceeds(
      getDoc(doc(as(USERS.employeeA), 'payslip_documents', 'org-a__emp-a1__2026-07')),
    );
  });

  it("an employee cannot read a colleague's payslip in the same organisation", async () => {
    await assertFails(
      getDoc(doc(as(USERS.employeeA), 'payslip_documents', 'org-a__emp-a2__2026-07')),
    );
  });

  it('a manager cannot read a payslip belonging to someone else', async () => {
    // Managers approve leave and expenses; salary is not theirs to see.
    await assertFails(
      getDoc(doc(as(USERS.managerA), 'payslip_documents', 'org-a__emp-a1__2026-07')),
    );
  });

  it('HR reads any payslip in their own organisation', async () => {
    await assertSucceeds(
      getDoc(doc(as(USERS.hrA), 'payslip_documents', 'org-a__emp-a1__2026-07')),
    );
  });

  it("HR cannot read another organisation's payslip", async () => {
    await assertFails(
      getDoc(doc(as(USERS.hrA), 'payslip_documents', 'org-b__emp-b1__2026-07')),
    );
  });

  it('an employee listing their own payslips is allowed', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(as(USERS.employeeA), 'payslip_documents'),
          where('orgId', '==', 'org-a'),
          where('employeeId', '==', 'emp-a1'),
        ),
      ),
    );
  });

  it('an employee listing the whole organisation is denied', async () => {
    // The denial is the safeguard: a list is evaluated against every document
    // it would return, so dropping the employeeId filter fails the query rather
    // than quietly returning the subset the caller is entitled to.
    await assertFails(
      getDocs(
        query(collection(as(USERS.employeeA), 'payslip_documents'), where('orgId', '==', 'org-a')),
      ),
    );
  });

  it('HR listing their own organisation is allowed', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(as(USERS.hrA), 'payslip_documents'), where('orgId', '==', 'org-a')),
      ),
    );
  });

  it('an unfiltered list is denied even for HR', async () => {
    await assertFails(getDocs(collection(as(USERS.hrA), 'payslip_documents')));
  });
});

describe('uploaded payslips — who may write them', () => {
  beforeEach(seed);

  const NEW_ID = 'org-a__emp-a1__2026-08';

  it('HR uploads a payslip for someone in their organisation', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08' }),
      ),
    );
  });

  it('a platform admin of the organisation may upload too', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.adminA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('a manager cannot upload', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.managerA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', uploadedByUid: USERS.managerA.uid }),
      ),
    );
  });

  it('an employee cannot upload their own payslip', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', uploadedByUid: USERS.employeeA.uid }),
      ),
    );
  });

  it("HR cannot upload into another organisation", async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrB), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', uploadedByUid: USERS.hrB.uid }),
      ),
    );
  });

  it("HR cannot overwrite another organisation's payslip by stamping their own orgId", async () => {
    // Without inMyOrg() on update this is a takeover: org-b's HR rewrites an
    // org-a document and relabels it as theirs.
    await assertFails(
      setDoc(
        doc(as(USERS.hrB), 'payslip_documents', 'org-a__emp-a1__2026-07'),
        payslip({ orgId: 'org-b', uploadedByUid: USERS.hrB.uid }),
      ),
    );
  });

  it('re-uploading the same month replaces it', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', 'org-a__emp-a1__2026-07'),
        payslip({ fileName: 'MC-A1-july-corrected.pdf' }),
      ),
    );
  });

  it('the uploader cannot be forged', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('the id must match the document it is written to', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: 'org-a__emp-a1__2026-07', month: '2026-08' }),
      ),
    );
  });

  it('a non-PDF is refused', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', contentType: 'image/png' }),
      ),
    );
  });

  it('an oversized payload is refused', async () => {
    // Mirrors PAYSLIP_MAX_BYTES. Past this the document approaches Firestore's
    // 1 MiB ceiling and the write fails anyway — with a far less obvious error.
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', sizeBytes: 737281 }),
      ),
    );
  });

  it('a malformed month is refused', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: 'August 2026' }),
      ),
    );
  });

  it('an empty filename is refused', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'payslip_documents', NEW_ID),
        payslip({ id: NEW_ID, month: '2026-08', fileName: '' }),
      ),
    );
  });

  it('HR deletes a payslip in their own organisation', async () => {
    await assertSucceeds(
      deleteDoc(doc(as(USERS.hrA), 'payslip_documents', 'org-a__emp-a1__2026-07')),
    );
  });

  it('an employee cannot delete their own payslip', async () => {
    await assertFails(
      deleteDoc(doc(as(USERS.employeeA), 'payslip_documents', 'org-a__emp-a1__2026-07')),
    );
  });

  it("HR cannot delete another organisation's payslip", async () => {
    await assertFails(
      deleteDoc(doc(as(USERS.hrB), 'payslip_documents', 'org-a__emp-a1__2026-07')),
    );
  });
});
