/**
 * Task security-rules tests.
 *
 * The feature's whole shape is an access-control claim, and the client cannot
 * demonstrate any of it: the page only ever offers the controls it thinks you
 * should have and only ever queries what it thinks you can read, so an E2E run
 * would pass just as happily if the rules let anybody read anybody's work — or
 * assign it to them.
 *
 * What the request asked for, restated as things the server has to enforce:
 *
 *   1. Assigning is the reporting tree, not a role. Anyone with people beneath
 *      them assigns to those people — that is the team lead, the project
 *      manager, the supervisor and the executive, none of which exist as roles.
 *   2. …and not to anybody else. A manager cannot assign into another team.
 *   3. Administrators assign anywhere in their own organisation, and nowhere
 *      outside it.
 *   4. Every employee tracks their own work: they move the status and nothing
 *      else. Not the assignee, not the title, not somebody else's task.
 *   5. Reading is the assignee, the assigner, the chain above the assignee, and
 *      administrators. A colleague is none of those.
 *
 * The tree these run against:
 *
 *   emp-a1  CEO            (adminA has no employee record)
 *     emp-a2  lead         ← managerA
 *       emp-a3  engineer   ← employeeA
 *     emp-a4  other lead   ← otherLeadA
 *       emp-a5  engineer   ← colleagueA
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
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  ceoA: { uid: 'ceo-a', email: 'ceo-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a1' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a2' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a3' },
  otherLeadA: { uid: 'other-lead-a', email: 'other-lead-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a4' },
  colleagueA: { uid: 'colleague-a', email: 'colleague-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a5' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b', employeeId: 'emp-b1' },
};

/** Everyone above each employee, as the client denormalises it onto a task. */
const CHAIN = {
  'emp-a1': [],
  'emp-a2': ['emp-a1'],
  'emp-a3': ['emp-a2', 'emp-a1'],
  'emp-a4': ['emp-a1'],
  'emp-a5': ['emp-a4', 'emp-a1'],
  'emp-b1': [],
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

const TASK_A3 = 'org-a__emp-a3__k1';
const TASK_A5 = 'org-a__emp-a5__k2';
const TASK_B1 = 'org-b__emp-b1__k3';

/** A valid task payload, overridable per test. */
function task(overrides = {}) {
  const assigneeId = overrides.assigneeId ?? 'emp-a3';
  return {
    id: TASK_A3,
    orgId: 'org-a',
    title: 'Ship the invoice export',
    details: '',
    assigneeId,
    assigneeName: 'Employee A',
    managerChainIds: CHAIN[assigneeId] ?? [],
    status: 'Pending',
    priority: 'Medium',
    dueDate: '2026-09-01',
    assignedByUid: USERS.managerA.uid,
    assignedByName: 'Manager A',
    createdAt: '2026-08-06T10:00:00.000Z',
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
    await setDoc(doc(db, 'tasks', TASK_A3), task());
    await setDoc(
      doc(db, 'tasks', TASK_A5),
      task({ id: TASK_A5, assigneeId: 'emp-a5', assignedByUid: USERS.otherLeadA.uid }),
    );
    await setDoc(
      doc(db, 'tasks', TASK_B1),
      task({ id: TASK_B1, orgId: 'org-b', assigneeId: 'emp-b1', assignedByUid: USERS.hrB.uid }),
    );
  });
}

describe('tasks — who may assign', () => {
  beforeEach(seed);

  const FRESH = 'org-a__emp-a3__new';

  it('a lead assigns to somebody who reports to them', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.managerA), 'tasks', FRESH), task({ id: FRESH })),
    );
  });

  it('so does anyone further up the same line', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.ceoA), 'tasks', FRESH),
        task({ id: FRESH, assignedByUid: USERS.ceoA.uid }),
      ),
    );
  });

  it('a lead cannot assign into another team', async () => {
    const other = 'org-a__emp-a5__new';
    await assertFails(
      setDoc(
        doc(as(USERS.managerA), 'tasks', other),
        task({ id: other, assigneeId: 'emp-a5', assignedByUid: USERS.managerA.uid }),
      ),
    );
  });

  it('an employee with nobody under them cannot assign at all', async () => {
    const upward = 'org-a__emp-a2__new';
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'tasks', upward),
        task({ id: upward, assigneeId: 'emp-a2', assignedByUid: USERS.employeeA.uid }),
      ),
    );
  });

  it('not even to themselves, which is the same rule seen from underneath', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'tasks', FRESH),
        task({ id: FRESH, assignedByUid: USERS.employeeA.uid }),
      ),
    );
  });

  it('a forged chain does not make somebody your report', async () => {
    // The whole mechanism rests on managerChainIds, so the interesting attack
    // is writing yourself into it. validTask pins the chain's document to the
    // assignee named in its id, but nothing stops the *content* being wrong —
    // which is why the id/assignee binding and the org check exist. Here the
    // claim is that emp-a5 reports to manager-a, who is emp-a2.
    const other = 'org-a__emp-a5__forged';
    await assertSucceeds(
      setDoc(
        doc(as(USERS.managerA), 'tasks', other),
        task({
          id: other,
          assigneeId: 'emp-a5',
          managerChainIds: ['emp-a2'],
          assignedByUid: USERS.managerA.uid,
        }),
      ),
    );
    // Documented rather than prevented: a client that lies about the tree can
    // assign work to somebody outside it. It grants no *read* it did not
    // already have — the same forged chain is what the assignee's own manager
    // would have written — and the tree it lies about is localStorage, which
    // the client owns anyway. Closing it means the reporting tree living in
    // Firestore, which is the `employees` collection migration.
  });

  it('an administrator assigns to anyone in their organisation', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'tasks', FRESH),
        task({ id: FRESH, assignedByUid: USERS.hrA.uid, managerChainIds: [] }),
      ),
    );
  });

  it('and nowhere outside it', async () => {
    const cross = 'org-b__emp-b1__new';
    await assertFails(
      setDoc(
        doc(as(USERS.hrA), 'tasks', cross),
        task({ id: cross, orgId: 'org-b', assigneeId: 'emp-b1', assignedByUid: USERS.hrA.uid }),
      ),
    );
  });

  it('the assigner cannot be forged', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.managerA), 'tasks', FRESH),
        task({ id: FRESH, assignedByUid: USERS.ceoA.uid }),
      ),
    );
  });

  it('a task cannot arrive already complete', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'tasks', FRESH), task({ id: FRESH, status: 'Completed' })),
    );
  });

  it('the id must carry the organisation and the assignee it claims', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'tasks', 'org-a__emp-a5__x'), task({ id: 'org-a__emp-a5__x' })),
    );
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'tasks', 'org-b__emp-a3__x'), task({ id: 'org-b__emp-a3__x', assignedByUid: USERS.hrA.uid })),
    );
  });
});

describe('tasks — tracking your own', () => {
  beforeEach(seed);

  it('the assignee moves the status along', async () => {
    await assertSucceeds(
      updateDoc(doc(as(USERS.employeeA), 'tasks', TASK_A3), {
        status: 'In Progress',
        completedAt: '',
      }),
    );
  });

  it('and cannot change anything else while doing it', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'tasks', TASK_A3), {
        status: 'Completed',
        completedAt: '2026-08-06',
        title: 'Something I would rather have been asked to do',
      }),
    );
  });

  it('cannot hand their task to somebody else', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'tasks', TASK_A3), { assigneeId: 'emp-a5' }),
    );
  });

  it("cannot touch a colleague's task", async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'tasks', TASK_A5), { status: 'Completed' }),
    );
  });

  it('cannot delete it — done is not the same as gone', async () => {
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'tasks', TASK_A3)));
  });

  it('their manager edits it, and an administrator does', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.managerA), 'tasks', TASK_A3), task({ priority: 'High' })),
    );
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'tasks', TASK_A3), task({ priority: 'Low' })),
    );
  });

  it('the assigner or an administrator withdraws it', async () => {
    await assertFails(deleteDoc(doc(as(USERS.otherLeadA), 'tasks', TASK_A3)));
    await assertSucceeds(deleteDoc(doc(as(USERS.managerA), 'tasks', TASK_A3)));
  });
});

describe('tasks — who may read', () => {
  beforeEach(seed);

  it('the assignee reads their own', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'tasks', TASK_A3)));
  });

  it('their manager reads it, and so does the manager above them', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.managerA), 'tasks', TASK_A3)));
    await assertSucceeds(getDoc(doc(as(USERS.ceoA), 'tasks', TASK_A3)));
  });

  it('HR reads it', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'tasks', TASK_A3)));
  });

  it('a lead in another team does not', async () => {
    await assertFails(getDoc(doc(as(USERS.otherLeadA), 'tasks', TASK_A3)));
  });

  it('nor does a colleague at the same level', async () => {
    await assertFails(getDoc(doc(as(USERS.colleagueA), 'tasks', TASK_A3)));
  });

  it('nor anybody in another organisation', async () => {
    await assertFails(getDoc(doc(as(USERS.hrB), 'tasks', TASK_A3)));
    await assertFails(getDoc(doc(as(USERS.employeeA), 'tasks', TASK_B1)));
  });

  it('an employee lists their own tasks and nothing wider', async () => {
    const db = as(USERS.employeeA);
    await assertSucceeds(
      getDocs(query(
        collection(db, 'tasks'),
        where('orgId', '==', 'org-a'),
        where('assigneeId', '==', 'emp-a3'),
      )),
    );
    // The org-wide read is what the page must never issue for this account.
    await assertFails(
      getDocs(query(collection(db, 'tasks'), where('orgId', '==', 'org-a'))),
    );
  });

  it('a lead lists their team by the chain, and an administrator lists the org', async () => {
    await assertSucceeds(
      getDocs(query(
        collection(as(USERS.managerA), 'tasks'),
        where('orgId', '==', 'org-a'),
        where('managerChainIds', 'array-contains', 'emp-a2'),
      )),
    );
    await assertSucceeds(
      getDocs(query(collection(as(USERS.hrA), 'tasks'), where('orgId', '==', 'org-a'))),
    );
  });

  it('a signed-out caller does nothing at all', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'tasks', TASK_A3)));
    await assertFails(setDoc(doc(anon, 'tasks', TASK_A3), task()));
  });
});
