/**
 * Firestore security-rules tests, run against the emulator.
 *
 * These assert the privilege boundary around the HR Manager role, which is
 * enforced only in `firestore.rules` — the E2E suite drives the UI and would
 * pass just as happily if the rules let an HR manager do anything at all.
 *
 * The two claims that matter most, and the reason this file exists:
 *   1. An HR manager cannot grant the `admin` role (no self-promotion).
 *   2. An HR manager cannot move themselves or anyone else between
 *      organisations, which is what "admin access for that company only"
 *      actually rests on.
 *
 * Run with `npm run test:rules` — that wraps the emulator around it.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

// Accounts under test. `orgId` is the boundary: org-a's HR manager must not be
// able to reach org-b, nor promote anyone, nor rewrite an orgId.
const USERS = {
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b' },
};

let testEnv;

/** A Firestore handle authenticated as one of the USERS above. */
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

/** Reset to a known set of user profiles, bypassing rules. */
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
      });
    }
    await setDoc(doc(db, 'employees', 'emp-001'), { fullName: 'Seed Person' });
    await setDoc(doc(db, 'employee_compensation', 'emp-001'), { employeeId: 'emp-001', ctc: 100 });
  });
}

describe('users/{uid} — HR manager privilege boundary', () => {
  beforeEach(seed);

  it('HR cannot promote another user to admin', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.employeeA.uid), { role: 'admin' }),
    );
  });

  it('HR cannot promote themselves to admin', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.hrA.uid), { role: 'admin' }),
    );
  });

  it('HR cannot edit a user who already holds admin', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.adminA.uid), { role: 'employee' }),
    );
  });

  it('HR cannot grant themselves superAdmin', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.hrA.uid), { superAdmin: true }),
    );
  });

  it('HR cannot move themselves into another organisation', async () => {
    // The original hole: the org-admin branch never constrained orgId, and did
    // not exclude self-writes, so this succeeded and handed org-b's data
    // namespace and /organizations record to org-a's HR manager.
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.hrA.uid), { orgId: 'org-b' }),
    );
  });

  it('HR cannot move another user into a different organisation', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.employeeA.uid), { orgId: 'org-b' }),
    );
  });

  it("HR cannot change a user in another organisation", async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.employeeB.uid), { role: 'manager' }),
    );
  });

  it('HR cannot delete a user in another organisation', async () => {
    await assertFails(deleteDoc(doc(as(USERS.hrA), 'users', USERS.employeeB.uid)));
  });

  it('HR cannot delete an admin', async () => {
    await assertFails(deleteDoc(doc(as(USERS.hrA), 'users', USERS.adminA.uid)));
  });

  it('HR cannot create a new admin', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'users', 'brand-new'), {
        uid: 'brand-new',
        email: 'new@example.com',
        role: 'admin',
        orgId: 'org-a',
      }),
    );
  });
});

describe('users/{uid} — what an HR manager must still be able to do', () => {
  beforeEach(seed);

  it('HR can set a role within their own organisation', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.employeeA.uid), { role: 'manager' }),
    );
  });

  it('HR can appoint another HR manager in their own organisation', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.hrA), 'users', USERS.managerA.uid), { role: 'hr' }),
    );
  });

  it('HR can remove a non-admin user from their own organisation', async () => {
    await assertSucceeds(deleteDoc(doc(as(USERS.hrA), 'users', USERS.employeeA.uid)));
  });

  it("HR's own sign-in upsert still succeeds", async () => {
    // auth.tsx re-writes the profile on every sign-in; if this were denied, an
    // HR manager could not log in at all.
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'users', USERS.hrA.uid),
        { displayName: 'HR A', role: 'hr', orgId: 'org-a' },
        { merge: true },
      ),
    );
  });
});

describe('users/{uid} — admin behaviour is unchanged', () => {
  beforeEach(seed);

  it('an admin can still grant the admin role', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.adminA), 'users', USERS.employeeA.uid), { role: 'admin' }),
    );
  });

  it('a manager cannot change roles', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.managerA), 'users', USERS.employeeA.uid), { role: 'admin' }),
    );
  });

  it('an employee cannot change their own role', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { role: 'admin' }),
    );
  });
});

describe('HR data collections', () => {
  beforeEach(seed);

  it('HR can write the employee directory — the access the app depends on', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'employees', 'emp-002'), { fullName: 'Added by HR' }),
    );
  });

  it('an employee still cannot write the employee directory', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'employees', 'emp-003'), { fullName: 'Nope' }),
    );
  });

  it('HR can read salary data', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'employee_compensation', 'emp-001')));
  });

  it('a manager cannot read salary data', async () => {
    await assertFails(getDoc(doc(as(USERS.managerA), 'employee_compensation', 'emp-001')));
  });

  it('an employee cannot read salary data', async () => {
    await assertFails(getDoc(doc(as(USERS.employeeA), 'employee_compensation', 'emp-001')));
  });
});
