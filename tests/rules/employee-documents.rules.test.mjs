/**
 * Employee-document security-rules tests.
 *
 * The upload permissions shipped as a rendering decision: the profile page hid
 * the button from whoever should not have it, and the library lived in
 * localStorage, so anyone who wanted the button back could have it. None of
 * what follows is testable through the UI — the client only ever offers the
 * controls it thinks you should have, so an E2E run passes just as happily
 * whether or not a stranger can file somebody's Aadhaar card.
 *
 * The claims the feature rests on:
 *
 *   1. A primary document — Aadhaar, PAN, bank details — is filed by the person
 *      it belongs to, or by HR. Not by a colleague, and not by a platform
 *      admin, whose job this is not.
 *   2. A secondary document — the organisation's paperwork — is filed by an
 *      administrator or HR, and not by the employee.
 *   3. Neither crosses an organisation boundary, in either direction.
 *   4. Verifying a document cannot double as renaming it, or "verify" would be
 *      a way to move a document across the primary/secondary line and file
 *      whatever the rule above refuses.
 *   5. The filer cannot be forged.
 *
 * "The person it belongs to" means the `employee_links/{uid}` document, which
 * only an administrator can write — the client's claim about who it is carries
 * no weight (see src/data/employeeLinks.ts).
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
import { doc, getDoc, getDocs, query, setDoc, deleteDoc, where, collection } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a3' },
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

const PAN = 'org-a__emp-a1__pan-card';
const CONTRACT = 'org-a__emp-a1__employment-contract';

/** A valid document payload, overridable per test. */
function record(overrides = {}) {
  return {
    id: PAN,
    orgId: 'org-a',
    employeeId: 'emp-a1',
    name: 'PAN Card',
    type: 'PDF',
    status: 'Pending',
    uploaded: '2026-08-06',
    size: '95 KB',
    uploadedByUid: USERS.employeeA.uid,
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

/** Reseed profiles, employee links and two filed documents, bypassing rules. */
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
    await setDoc(doc(db, 'employee_documents', PAN), record());
    await setDoc(
      doc(db, 'employee_documents', CONTRACT),
      record({ id: CONTRACT, name: 'Employment Contract', uploadedByUid: USERS.hrA.uid }),
    );
    await setDoc(
      doc(db, 'employee_documents', 'org-b__emp-b1__pan-card'),
      record({ id: 'org-b__emp-b1__pan-card', orgId: 'org-b', employeeId: 'emp-b1', uploadedByUid: USERS.employeeB.uid }),
    );
  });
}

describe('employee documents — filing a primary document', () => {
  beforeEach(seed);

  it('the employee files their own PAN card', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'employee_documents', PAN), record()),
    );
  });

  it('HR files it on their behalf', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'employee_documents', PAN),
        record({ uploadedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it("a colleague cannot file somebody else's PAN card", async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.colleagueA), 'employee_documents', PAN),
        record({ uploadedByUid: USERS.colleagueA.uid }),
      ),
    );
  });

  it('a platform admin cannot either — filing an identity document is not their job', async () => {
    // A document that does not exist yet, so this is a filing and not the
    // status edit an administrator is entitled to make on one that does.
    const fresh = 'org-a__emp-a1__aadhaar-card';
    await assertFails(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', fresh),
        record({ id: fresh, name: 'Aadhaar Card', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('a manager cannot file it for one of their reports', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.managerA), 'employee_documents', PAN),
        record({ uploadedByUid: USERS.managerA.uid }),
      ),
    );
  });

  it('a manager still files their own', async () => {
    const own = 'org-a__emp-a3__pan-card';
    await assertSucceeds(
      setDoc(
        doc(as(USERS.managerA), 'employee_documents', own),
        record({ id: own, employeeId: 'emp-a3', uploadedByUid: USERS.managerA.uid }),
      ),
    );
  });

  it('the name is matched exactly, so lookalike paperwork is secondary', async () => {
    // "Aadhaar Card Verification Note" is the organisation's paperwork about
    // the employee, not their Aadhaar card — so the employee may not file it.
    const lookalike = 'org-a__emp-a1__aadhaar-card-verification-note';
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'employee_documents', lookalike),
        record({ id: lookalike, name: 'Aadhaar Card Verification Note' }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', lookalike),
        record({ id: lookalike, name: 'Aadhaar Card Verification Note', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('spelling and case do not get round the rule', async () => {
    for (const name of ['aadhar card', 'AADHAAR CARD', '  Pan Card  ']) {
      await assertFails(
        setDoc(
          doc(as(USERS.adminA), 'employee_documents', 'org-a__emp-a1__variant'),
          record({ id: 'org-a__emp-a1__variant', name, uploadedByUid: USERS.adminA.uid }),
        ),
      );
    }
  });
});

describe('employee documents — filing a secondary document', () => {
  beforeEach(seed);

  it('an administrator files the organisation’s paperwork', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', CONTRACT),
        record({ id: CONTRACT, name: 'Employment Contract', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('so does HR', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'employee_documents', CONTRACT),
        record({ id: CONTRACT, name: 'Employment Contract', uploadedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it('the employee cannot file it against their own record', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'employee_documents', CONTRACT),
        record({ id: CONTRACT, name: 'Employment Contract' }),
      ),
    );
  });

  it('a manager cannot file it', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.managerA), 'employee_documents', CONTRACT),
        record({ id: CONTRACT, name: 'Employment Contract', uploadedByUid: USERS.managerA.uid }),
      ),
    );
  });
});

describe('employee documents — verifying one', () => {
  beforeEach(seed);

  it('an administrator marks a document verified, and the filer keeps their name on it', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', PAN),
        record({ status: 'Verified' }),
      ),
    );
  });

  it('an administrator cannot take credit for filing it while verifying it', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', PAN),
        record({ status: 'Verified', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('the employee cannot verify their own document by re-filing it', async () => {
    // They may re-file it — that is the create rule again — but a filing
    // arrives Pending. Without that clause "re-file" is how you verify
    // yourself, which is the whole point of having somebody else verify.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'employee_documents', PAN),
        record({ status: 'Verified' }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'employee_documents', PAN), record()),
    );
  });

  it('nor can HR verify one — administering people is not attesting to their papers', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'employee_documents', PAN),
        record({ status: 'Verified', uploadedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it('verifying cannot rename a document across the primary boundary', async () => {
    // Otherwise an administrator files anything they like as "Employment
    // Contract" and then renames it to "PAN Card", and the rule that says they
    // may not file a PAN card has been undone by an update.
    await assertFails(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', CONTRACT),
        record({ id: CONTRACT, name: 'PAN Card', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('nor can it move a document onto a different employee', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.adminA), 'employee_documents', CONTRACT),
        record({ id: CONTRACT, name: 'Employment Contract', employeeId: 'emp-a2', uploadedByUid: USERS.adminA.uid }),
      ),
    );
  });
});

describe('employee documents — the filer, and the organisation', () => {
  beforeEach(seed);

  it('the filer cannot be forged', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'employee_documents', PAN),
        record({ uploadedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it('the id must carry the organisation the document claims', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'employee_documents', 'org-b__emp-a1__pan-card'),
        record({ id: 'org-b__emp-a1__pan-card', uploadedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it("HR cannot file into another organisation", async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrB), 'employee_documents', PAN),
        record({ uploadedByUid: USERS.hrB.uid }),
      ),
    );
  });

  it("HR cannot overwrite another organisation's document while stamping their own orgId", async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'employee_documents', 'org-b__emp-b1__pan-card'),
        record({ id: 'org-b__emp-b1__pan-card', uploadedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it("a colleague reads a document in their own organisation, but nobody reads another organisation's", async () => {
    await assertSucceeds(getDoc(doc(as(USERS.colleagueA), 'employee_documents', PAN)));
    await assertFails(getDoc(doc(as(USERS.employeeA), 'employee_documents', 'org-b__emp-b1__pan-card')));
  });

  it('an org-filtered list succeeds and an unfiltered one is denied', async () => {
    const db = as(USERS.employeeA);
    await assertSucceeds(
      getDocs(query(collection(db, 'employee_documents'), where('orgId', '==', 'org-a'))),
    );
    await assertFails(getDocs(query(collection(db, 'employee_documents'))));
  });

  it('only an org administrator deletes', async () => {
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'employee_documents', PAN)));
    await assertFails(deleteDoc(doc(as(USERS.hrB), 'employee_documents', PAN)));
    await assertSucceeds(deleteDoc(doc(as(USERS.hrA), 'employee_documents', PAN)));
  });

  it('a signed-out caller does nothing at all', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'employee_documents', PAN)));
    await assertFails(setDoc(doc(anon, 'employee_documents', PAN), record()));
  });
});
