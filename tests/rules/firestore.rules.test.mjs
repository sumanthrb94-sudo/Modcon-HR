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
  superA: { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true },
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
        ...(user.superAdmin ? { superAdmin: true } : {}),
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

describe('role_assignments — granting HR access to an employee', () => {
  beforeEach(seed);

  it('an org admin can assign the HR role to an email', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.adminA), 'role_assignments', 'newjoiner@example.com'), {
        email: 'newjoiner@example.com',
        role: 'hr',
        orgId: 'org-a',
        assignedBy: USERS.adminA.uid,
      }),
    );
  });

  it('an HR manager can assign the HR role within their own organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'role_assignments', 'newjoiner@example.com'), {
        email: 'newjoiner@example.com',
        role: 'hr',
        orgId: 'org-a',
        assignedBy: USERS.hrA.uid,
      }),
    );
  });

  it('nobody can assign the admin role through this collection', async () => {
    // Otherwise it would be a way around the /users rules, which never let an
    // HR manager grant admin.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'role_assignments', 'newjoiner@example.com'), {
        email: 'newjoiner@example.com',
        role: 'admin',
        orgId: 'org-a',
        assignedBy: USERS.hrA.uid,
      }),
    );
  });

  it('an HR manager cannot assign into another organisation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'role_assignments', 'newjoiner@example.com'), {
        email: 'newjoiner@example.com',
        role: 'hr',
        orgId: 'org-b',
        assignedBy: USERS.hrA.uid,
      }),
    );
  });

  it('an assignment cannot be filed under an id that is not its email', async () => {
    await assertFails(
      setDoc(doc(as(USERS.adminA), 'role_assignments', 'victim@example.com'), {
        email: 'someone-else@example.com',
        role: 'hr',
        orgId: 'org-a',
        assignedBy: USERS.adminA.uid,
      }),
    );
  });

  it('a user can read their own assignment but not a colleague\'s', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'role_assignments', USERS.employeeA.email), {
        email: USERS.employeeA.email, role: 'hr', orgId: 'org-a', assignedBy: USERS.adminA.uid,
      });
      await setDoc(doc(db, 'role_assignments', USERS.managerA.email), {
        email: USERS.managerA.email, role: 'hr', orgId: 'org-a', assignedBy: USERS.adminA.uid,
      });
    });
    // Own assignment: needed by auth.tsx at sign-in.
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'role_assignments', USERS.employeeA.email)));
    // Somebody else's: would otherwise expose every colleague's address and role.
    await assertFails(getDoc(doc(as(USERS.employeeA), 'role_assignments', USERS.managerA.email)));
    // Administrators manage the collection, so they may read it.
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'role_assignments', USERS.managerA.email)));
  });

  it('a manager cannot assign roles', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'role_assignments', 'newjoiner@example.com'), {
        email: 'newjoiner@example.com',
        role: 'hr',
        orgId: 'org-a',
        assignedBy: USERS.managerA.uid,
      }),
    );
  });

  it('an employee cannot assign themselves a role', async () => {
    // The whole point of the collection: the grant must come from someone who
    // already holds the privilege, never from the person receiving it.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'role_assignments', USERS.employeeA.email), {
        email: USERS.employeeA.email,
        role: 'hr',
        orgId: 'org-a',
        assignedBy: USERS.employeeA.uid,
      }),
    );
  });
});

describe('role_assignments — adopting an assigned role at sign-in', () => {
  beforeEach(seed);

  /** Write an assignment as the admin would have, bypassing rules. */
  async function assignment(email, role, orgId = 'org-a') {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'role_assignments', email), {
        email, role, orgId, assignedBy: USERS.adminA.uid,
      });
    });
  }

  it('a new account adopts the HR role its administrator assigned', async () => {
    await assignment('newjoiner@example.com', 'hr');
    const db = testEnv
      .authenticatedContext('new-uid', { email: 'newjoiner@example.com' })
      .firestore();
    await assertSucceeds(
      setDoc(doc(db, 'users', 'new-uid'), {
        uid: 'new-uid',
        email: 'newjoiner@example.com',
        displayName: 'New Joiner',
        role: 'hr',
      }),
    );
  });

  it('an existing account adopts an assignment made after it was created', async () => {
    await assignment(USERS.employeeA.email, 'hr');
    await assertSucceeds(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { role: 'hr' }),
    );
  });

  it('an account cannot claim a role nobody assigned it', async () => {
    // No assignment document exists for this address.
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { role: 'hr' }),
    );
  });

  it("an account cannot claim a role assigned to somebody else's email", async () => {
    await assignment('someone-else@example.com', 'hr');
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { role: 'hr' }),
    );
  });

  it('an account cannot claim admin even if an assignment somehow says admin', async () => {
    // Defence in depth: the write rule above rejects role == 'admin', but if
    // such a document existed it must still not be adoptable.
    await assignment(USERS.employeeA.email, 'admin');
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { role: 'admin' }),
    );
  });

  it('an assignment cannot be used to grant superAdmin', async () => {
    await assignment(USERS.employeeA.email, 'hr');
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), {
        role: 'hr',
        superAdmin: true,
      }),
    );
  });
});


describe('organization provisioning — the first account is an HR administrator', () => {
  beforeEach(seed);

  it('a super admin can provision a new organisation\'s HR account', async () => {
    // What lib/organizations.ts writes: the role is `hr`, not `admin`, so the
    // account administers one organisation without being a platform admin.
    await assertSucceeds(
      setDoc(doc(as(USERS.superA), 'users', 'new-org-admin'), {
        uid: 'new-org-admin',
        email: 'hr@acme.com',
        displayName: 'Acme HR',
        photoURL: null,
        role: 'hr',
        orgId: 'org-acme',
        superAdmin: false,
      }),
    );
  });

  it('a super admin can record the matching role assignment for another org', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.superA), 'role_assignments', 'hr@acme.com'), {
        email: 'hr@acme.com',
        role: 'hr',
        orgId: 'org-acme',
        assignedBy: USERS.superA.uid,
      }),
    );
  });

  it('provisioning cannot mint another super admin', async () => {
    await assertFails(
      setDoc(doc(as(USERS.adminA), 'users', 'new-org-admin'), {
        uid: 'new-org-admin',
        email: 'hr@acme.com',
        displayName: 'Acme HR',
        role: 'hr',
        orgId: 'org-acme',
        superAdmin: true,
      }),
    );
  });

  it('the provisioned account cannot promote itself once it signs in', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'acme-hr'), {
        uid: 'acme-hr', email: 'hr@acme.com', displayName: 'Acme HR',
        role: 'hr', orgId: 'org-acme',
      });
    });
    const db = testEnv.authenticatedContext('acme-hr', { email: 'hr@acme.com' }).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'acme-hr'), { role: 'admin' }));
  });

  it('the provisioned account cannot reach another organisation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'acme-hr'), {
        uid: 'acme-hr', email: 'hr@acme.com', displayName: 'Acme HR',
        role: 'hr', orgId: 'org-acme',
      });
    });
    const db = testEnv.authenticatedContext('acme-hr', { email: 'hr@acme.com' }).firestore();
    await assertFails(updateDoc(doc(db, 'users', USERS.employeeA.uid), { role: 'manager' }));
  });
});


describe('migrating a legacy org admin down to HR', () => {
  beforeEach(seed);

  /** An organisation provisioned before the first account became `hr`. */
  async function legacyOrgAdmin() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'legacy-org-admin'), {
        uid: 'legacy-org-admin',
        email: 'legacy@acme.com',
        displayName: 'Legacy Acme Admin',
        role: 'admin',
        orgId: 'org-acme',
      });
    });
  }

  it('a super admin can demote a legacy org admin to HR', async () => {
    await legacyOrgAdmin();
    await assertSucceeds(
      updateDoc(doc(as(USERS.superA), 'users', 'legacy-org-admin'), { role: 'hr' }),
    );
  });

  it('an HR manager cannot run the migration', async () => {
    // The demotion targets an account holding `admin`, which HR may not edit —
    // so this is super-admin/admin work, as the UI gating implies.
    await legacyOrgAdmin();
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'users', 'legacy-org-admin'), { role: 'hr' }),
    );
  });

  it('the demotion does not strip or grant superAdmin', async () => {
    await legacyOrgAdmin();
    await assertFails(
      updateDoc(doc(as(USERS.adminA), 'users', 'legacy-org-admin'), { role: 'hr', superAdmin: true }),
    );
  });
});
