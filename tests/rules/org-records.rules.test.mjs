/**
 * Shared record collections — security-rules tests.
 *
 * `org_records` is where attendance, leave, assets, expenses, helpdesk,
 * payroll and onboarding now live. They used to be localStorage and nothing
 * else, so there was no boundary to test: every check was a hidden button and
 * every dataset was one browser's.
 *
 * What these tests claim, and it is worth being precise because the block is
 * deliberately coarser than the others in this file:
 *
 *   1. It is a TENANT boundary. A member of org A reads and writes org A's
 *      records and none of org B's, and the document id cannot be forged to
 *      file a record under a tenant the caller does not belong to.
 *   2. Leave decisions need authority. An ordinary employee cannot move a
 *      leave request out of Pending — not their own, not anybody's. This is
 *      the coarse half of the rule `src/lib/dataScope.ts` computes precisely;
 *      the org chart it walks is not available to these rules.
 *   3. A hard delete is an administrator's. Ordinary removal is a tombstone
 *      written through the same create/update path.
 *
 *   4. Expense decisions need authority, and payroll runs are an
 *      administrator's. Both are per-store clauses added after the QA
 *      hand-off's G1 suite found the generic block let any signed-in member
 *      approve a claim — their own included — and invent a payroll run.
 *
 * What they do NOT claim: that a ticket is edited only by its owner, or that
 * a manager decides only their OWN reports' claims. Those are still
 * client-side, and docs/shared-records-spec.md §5 says so. Nor is this a
 * per-record READ boundary: reads stay organisation-wide, for the reasons
 * set out on the get/list rule in firestore.rules.
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
  // A manager who is also somebody in the directory. `isSelf` can only
  // recognise self-approval for an account an administrator has linked, so
  // the unlinked `managerA` above cannot exercise that rule at all — it is
  // the control, and this is the case.
  managerLinkedA: {
    uid: 'manager-linked-a',
    email: 'manager-linked-a@example.com',
    role: 'manager',
    orgId: 'org-a',
    employeeId: 'emp-a2',
  },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a1' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b', employeeId: 'emp-b1' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

/** A record as `persistentCollection` writes it. */
function record({ org = 'org-a', store = 'tickets', id = 'tkt-1', ...rest } = {}) {
  return {
    orgId: org,
    store,
    recordId: id,
    deleted: false,
    data: JSON.stringify({ id, subject: 'Laptop will not charge' }),
    ...rest,
  };
}

function docId({ org = 'org-a', store = 'tickets', id = 'tkt-1' } = {}) {
  return `${org}__${store}__${id}`;
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
    await setDoc(doc(db, 'org_records', docId()), record());
    await setDoc(
      doc(db, 'org_records', docId({ org: 'org-b', id: 'tkt-b1' })),
      record({ org: 'org-b', id: 'tkt-b1' }),
    );
    // A pending leave request for the authority tests to attack.
    await setDoc(
      doc(db, 'org_records', docId({ store: 'leaveRequests', id: 'lv-1' })),
      record({ store: 'leaveRequests', id: 'lv-1', employeeId: 'emp-a1', status: 'Pending' }),
    );
  });
}

beforeEach(seed);

describe('the tenant boundary', () => {
  it('an ordinary employee writes a record in their own organisation', async () => {
    // The whole point of the move: an employee raising a ticket or checking in
    // has to be able to write, or the collection is read-only and useless.
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', docId({ id: 'tkt-new' })), record({ id: 'tkt-new' })),
    );
  });

  it('reads its own organisation and not another', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'org_records', docId())));
    await assertFails(
      getDoc(doc(as(USERS.employeeA), 'org_records', docId({ org: 'org-b', id: 'tkt-b1' }))),
    );
  });

  it('a list must filter on the organisation', async () => {
    const db = as(USERS.employeeA);
    // A list is evaluated against every document it returns and fails whole if
    // one belongs to another tenant, so the unfiltered read is denied rather
    // than merely wasteful.
    await assertFails(getDocs(collection(db, 'org_records')));
    await assertSucceeds(
      getDocs(query(collection(db, 'org_records'), where('orgId', '==', 'org-a'))),
    );
  });

  it('cannot write into another organisation', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId({ org: 'org-b', id: 'tkt-x' })),
        record({ org: 'org-b', id: 'tkt-x' }),
      ),
    );
  });

  it('cannot overwrite another organisation’s record while stamping its own orgId', async () => {
    // Stamping your own org onto somebody else's document is a takeover, not a
    // write — the same trap `inMyOrg()` closes elsewhere in this file.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId({ org: 'org-b', id: 'tkt-b1' })),
        record({ org: 'org-a', id: 'tkt-b1' }),
      ),
    );
  });

  it('the id must agree with the org, store and record inside it', async () => {
    // Otherwise a record is filed under one store while claiming another, and
    // the subscription that reads it never finds it again.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_records', docId({ id: 'tkt-1' })), record({ id: 'tkt-2' })),
    );
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId({ store: 'tickets', id: 'tkt-9' })),
        record({ store: 'assets', id: 'tkt-9' }),
      ),
    );
  });

  it('an unauthenticated caller reads and writes nothing', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'org_records', docId())));
    await assertFails(setDoc(doc(anon, 'org_records', docId({ id: 'tkt-anon' })), record({ id: 'tkt-anon' })));
  });

  it('a record too large to be one is refused', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId({ id: 'tkt-big' })),
        record({ id: 'tkt-big', data: 'x'.repeat(200_001) }),
      ),
    );
  });
});

describe('leave decisions need authority', () => {
  function leave(status, extra = {}) {
    return record({ store: 'leaveRequests', id: 'lv-1', employeeId: 'emp-a1', status, ...extra });
  }
  const leaveDoc = docId({ store: 'leaveRequests', id: 'lv-1' });

  it('an employee raises a request', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId({ store: 'leaveRequests', id: 'lv-new' })),
        record({ store: 'leaveRequests', id: 'lv-new', employeeId: 'emp-a1', status: 'Pending' }),
      ),
    );
  });

  it('an employee cannot approve their own', async () => {
    // The case the whole rule exists for. Before the move this was a hidden
    // button; now it is refused by the server.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_records', leaveDoc), leave('Approved')),
    );
  });

  it('an employee cannot approve anybody else’s either', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', leaveDoc),
        leave('Approved', { employeeId: 'emp-a2' }),
      ),
    );
  });

  it('an employee cannot reject one', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_records', leaveDoc), leave('Rejected')),
    );
  });

  it('an employee may cancel', async () => {
    // Withdrawing a request is not a decision on it, and refusing this would
    // leave somebody unable to take back a day they no longer need.
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', leaveDoc), leave('Cancelled')),
    );
  });

  it('a manager approves', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.managerA), 'org_records', leaveDoc), leave('Approved')),
    );
  });

  it('HR approves', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'org_records', leaveDoc), leave('Approved')),
    );
  });

  it('a linked manager cannot approve their own request', async () => {
    // Authority and interest as the same person — the one case `isManager()`
    // alone let through. `managerLinkedA` is `emp-a2`, so this is their own
    // request and the server now refuses it however senior they are.
    await assertFails(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', docId({ store: 'leaveRequests', id: 'lv-2' })),
        record({ store: 'leaveRequests', id: 'lv-2', employeeId: 'emp-a2', status: 'Approved' }),
      ),
    );
  });

  it('a linked manager cannot reject their own either', async () => {
    // Refusing your own request is deciding it just as much as approving is —
    // and is how somebody manufactures a rejection to point at later.
    await assertFails(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', docId({ store: 'leaveRequests', id: 'lv-2' })),
        record({ store: 'leaveRequests', id: 'lv-2', employeeId: 'emp-a2', status: 'Rejected' }),
      ),
    );
  });

  it('but still decides somebody else’s', async () => {
    // The rule narrows to self and no further: a linked manager is still a
    // manager for the rest of the organisation.
    await assertSucceeds(
      setDoc(doc(as(USERS.managerLinkedA), 'org_records', leaveDoc), leave('Approved')),
    );
  });

  it('a linked manager may still cancel their own', async () => {
    // Withdrawing your own request is not deciding it, and the Cancelled
    // exemption above is what keeps that true for managers too.
    await assertSucceeds(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', docId({ store: 'leaveRequests', id: 'lv-2' })),
        record({ store: 'leaveRequests', id: 'lv-2', employeeId: 'emp-a2', status: 'Cancelled' }),
      ),
    );
  });

  it('an unlinked manager decides exactly as before', async () => {
    // The honest limit, asserted rather than left to be discovered: with no
    // `employee_links` document there is no "self" to recognise, so this
    // manager is unaffected by the rule above. Nobody who could act
    // yesterday is refused today.
    await assertSucceeds(
      setDoc(doc(as(USERS.managerA), 'org_records', leaveDoc), leave('Approved')),
    );
  });

  it('another organisation’s manager cannot', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'org_records', leaveDoc), leave('Approved')),
    );
  });

  it('the status rule does not leak onto other stores', async () => {
    // A helpdesk ticket carries a `status` too, and nothing decides one but
    // the client. A rule written about leave must not reach it.
    //
    // This test used to make the same point with an expense claim, back when
    // approving one was client-side as well. It is no longer — see the
    // describe block below — so the claim would now be refused for a reason
    // that has nothing to do with leak-through, and the test would pass while
    // proving nothing. Moved to a store that is still genuinely ungoverned.
    await assertSucceeds(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId({ id: 'tkt-9' })),
        record({ id: 'tkt-9', status: 'Resolved' }),
      ),
    );
  });
});

describe('expense decisions need authority', () => {
  // The contract this block asserts CHANGED, and deliberately: approving an
  // expense claim used to be client-side, which the header above and §5 of
  // docs/shared-records-spec.md both said. `expenseDecisionIsAuthorised()`
  // now states the coarse half on the server, mirroring the leave rule —
  // an approved claim is money paid, so the transition that releases it is
  // worth more than a hidden button. Raised by the QA hand-off's G1 suite
  // (tests/rules/qa-gates.rules.test.mjs).
  const expenseDoc = docId({ store: 'expenseClaims', id: 'exp-1' });
  // `readableBy` is the subject plus everyone above them, stamped at write
  // time by src/data/persistence.ts — and since narrowedRecordWriteIsAuthorised
  // takes authority from it, a fixture without one is a claim nobody but an
  // administrator may decide. emp-a2 is managerLinkedA's employee record.
  const claim = (status, employeeId = 'emp-a1') =>
    record({
      store: 'expenseClaims',
      id: 'exp-1',
      status,
      employeeId,
      readableBy: [employeeId, 'emp-a2'],
    });

  it('an employee raises and edits their own claim', async () => {
    // The states a claimant owns. Refusing these would make the module
    // unusable for the role the permission matrix gives it `full`.
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', expenseDoc), claim('Draft')),
    );
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', expenseDoc), claim('Submitted')),
    );
  });

  it('an employee cannot approve a claim — not even their own', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_records', expenseDoc), claim('Approved')),
    );
  });

  it('nor walk it to Reimbursed', async () => {
    // Marking a claim paid is a finance action. Left employee-writable, a
    // claimant could step their own claim to the end of the workflow.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'org_records', expenseDoc), claim('Reimbursed')),
    );
  });

  it('a manager decides somebody else’s', async () => {
    // The ordinary path, and the one the QA pass confirmed working
    // (a Manager approving a report's claim). `isManager()` rather than
    // `isOrgAdmin()` for exactly that reason.
    await assertSucceeds(
      setDoc(doc(as(USERS.managerLinkedA), 'org_records', expenseDoc), claim('Approved')),
    );
  });

  it('but not their own', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', expenseDoc),
        claim('Approved', 'emp-a2'),
      ),
    );
  });

  it('another organisation’s manager cannot', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'org_records', expenseDoc), claim('Approved')),
    );
  });
});

describe('a decision status must be declared where the rules can read it', () => {
  // Found by QA against the first version of expenseDecisionIsAuthorised(),
  // and true of leaveDecisionIsAuthorised() since it was written: both used
  // to open with `!('status' in request.resource.data)`, so a write that
  // simply left the top-level field off skipped the guard entirely.
  //
  // It is not a theoretical hole. The app never reads the lifted field —
  // `hydrate` (src/data/persistence.ts) takes recordId, data and deleted and
  // nothing else — so the status every browser renders is the one inside the
  // `data` JSON. Omit the top-level copy and the server judges nothing while
  // the organisation is shown an approval nobody made.
  const smuggled = (store, status) => ({
    orgId: 'org-a',
    store,
    recordId: 'smuggled',
    deleted: false,
    employeeId: 'emp-a1',
    // The status lives ONLY where the rules cannot look.
    data: JSON.stringify({ id: 'smuggled', status }),
  });
  const smuggledDoc = (store) => docId({ store, id: 'smuggled' });

  it('an employee cannot approve their own claim by hiding the status in `data`', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', smuggledDoc('expenseClaims')),
        smuggled('expenseClaims', 'Approved'),
      ),
    );
  });

  it('nor their own leave request', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', smuggledDoc('leaveRequests')),
        smuggled('leaveRequests', 'Approved'),
      ),
    );
  });

  it('and a manager cannot either — the declaration is required of everyone', async () => {
    // Not because a manager may not approve, but because a write the rules
    // cannot read is not a write they can authorise. Declaring it is the
    // whole contract.
    await assertFails(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', smuggledDoc('expenseClaims')),
        smuggled('expenseClaims', 'Approved'),
      ),
    );
  });

  it('a store with no decision rule is unaffected', async () => {
    // Only leaveRequests and expenseClaims are governed. A ticket carries a
    // status too and nothing decides one, so requiring a declaration of it
    // would be a rule about a store nobody asked for.
    await assertSucceeds(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', smuggledDoc('tickets')),
        smuggled('tickets', 'Resolved'),
      ),
    );
  });

  it('a tombstone carries no record and so declares no status', async () => {
    // Ordinary removal is a tombstone written through this same path. It has
    // no record to take a status from, which is why the exemption is keyed on
    // the empty payload rather than on the absent field — keying it on the
    // field is what made the old hatch exploitable.
    // Seeded first: a tombstone carries no payload to judge, so authority
    // comes from the STORED record — and a tombstone for a record that never
    // existed has neither, which narrowedRecordWriteIsAuthorised rightly
    // refuses.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'org_records', docId({ store: 'expenseClaims', id: 'exp-1' })),
        record({ store: 'expenseClaims', id: 'exp-1', status: 'Submitted', employeeId: 'emp-a1' }),
      );
    });
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', docId({ store: 'expenseClaims', id: 'exp-1' })), {
        orgId: 'org-a',
        store: 'expenseClaims',
        recordId: 'exp-1',
        deleted: true,
        data: '',
      }),
    );
  });

  it('nor does a revert', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', docId({ store: 'leaveRequests', id: 'lv-1' })), {
        orgId: 'org-a',
        store: 'leaveRequests',
        recordId: 'lv-1',
        deleted: false,
        data: '',
        reverted: true,
      }),
    );
  });
});

describe('payroll runs are an administrator’s', () => {
  // A payroll run carries `grossTotal`, `netTotal` and `employeeCount` for
  // the whole company, and the dashboards read it as fact. Until
  // `payrollWriteIsAuthorised()` existed any signed-in member could create
  // one — a month of payroll that appears to have happened.
  const runDoc = docId({ store: 'payrollRuns', id: 'run-1' });
  const run = () => record({ store: 'payrollRuns', id: 'run-1', total: 96000 });

  it('an ordinary employee cannot write one', async () => {
    await assertFails(setDoc(doc(as(USERS.employeeA), 'org_records', runDoc), run()));
  });

  it('nor can a manager — Payroll is `none` for that role', async () => {
    // src/lib/accessControl.ts: Payroll is Admin/HR Manager only, so this is
    // `isOrgAdmin()` and not the `isManager()` the two clauses above use.
    await assertFails(setDoc(doc(as(USERS.managerA), 'org_records', runDoc), run()));
  });

  it('an administrator can', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'org_records', runDoc), run()));
  });

  it('but not in another organisation', async () => {
    await assertFails(setDoc(doc(as(USERS.hrB), 'org_records', runDoc), run()));
  });
});

describe('deletion', () => {
  it('an ordinary employee cannot hard-delete a record', async () => {
    // Ordinary removal is a tombstone written through create/update; a hard
    // delete is an administrator clearing data.
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'org_records', docId())));
  });

  it('an administrator can', async () => {
    await assertSucceeds(deleteDoc(doc(as(USERS.hrA), 'org_records', docId())));
  });

  it('but not in another organisation', async () => {
    await assertFails(
      deleteDoc(doc(as(USERS.hrA), 'org_records', docId({ org: 'org-b', id: 'tkt-b1' }))),
    );
  });

  it('a tombstone is an ordinary write anybody in the org can make', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', docId()),
        record({ deleted: true, data: '' }),
      ),
    );
  });
});

/**
 * The employee directory — the second per-store authority clause.
 *
 * The directory moved into `org_records` so an organisation's people exist for
 * everybody in it rather than in whichever browser typed them. That move is
 * only safe with this rule, because the record carries `ctc`: under the generic
 * block any signed-in member could raise their own salary, promote themselves
 * out of a reporting line, or remove a colleague, and every other browser in
 * the company would then be shown it as fact.
 *
 * While the directory lived in localStorage that lie reached one browser. This
 * is what stops the server publishing it. See §5 of docs/shared-records-spec.md
 * — name the store, do not widen the generic block.
 */
describe('only an administrator writes the employee directory', () => {
  const person = (over = {}) =>
    record({
      store: 'employees',
      id: 'emp-a1',
      data: JSON.stringify({ id: 'emp-a1', fullName: 'Aarav Sharma', ctc: 900000 }),
      ...over,
    });
  const personDoc = docId({ store: 'employees', id: 'emp-a1' });

  it('HR can add somebody', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'org_records', personDoc), person()));
  });

  it('a platform admin can too', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.adminA), 'org_records', personDoc), person()));
  });

  it('an employee cannot — this is the salary they would be editing', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', personDoc),
        person({ data: JSON.stringify({ id: 'emp-a1', fullName: 'Aarav Sharma', ctc: 9000000 }) }),
      ),
    );
  });

  it('an employee cannot rewrite their own record either', async () => {
    // `isSelf` would be satisfied — emp-a1 is who this account is — and it
    // still fails. Being the subject of a directory record is not authority
    // over it; that is the difference between this store and a leave request.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', personDoc),
        person({ data: JSON.stringify({ id: 'emp-a1', fullName: 'Aarav Sharma', designation: 'CEO' }) }),
      ),
    );
  });

  it('a manager is not an administrator here', async () => {
    await assertFails(setDoc(doc(as(USERS.managerA), 'org_records', personDoc), person()));
  });

  it('an employee cannot tombstone a colleague out of the directory', async () => {
    // A removal is written as an ordinary record with `deleted`, which the
    // generic block allows for every other store — so it needs saying that
    // this one is different.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', personDoc),
        person({ deleted: true, data: '' }),
      ),
    );
  });

  it("another organisation's administrator cannot write into this directory", async () => {
    await assertFails(setDoc(doc(as(USERS.hrB), 'org_records', personDoc), person()));
  });

  it('everyone in the organisation may still read it', async () => {
    // A directory nobody can read is not a directory. What each role is
    // *shown* is narrowed in lib/dataScope.ts, not here.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'org_records', personDoc), person());
    });
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'org_records', personDoc)));
  });
});

describe('attendance is written by its subject, or by HR and Admin', () => {
  function attendance({ employeeId = 'emp-a1', id = 'att-1', ...rest } = {}) {
    return record({ store: 'attendanceRecords', id, employeeId, ...rest });
  }
  const attDoc = (id = 'att-1') => docId({ store: 'attendanceRecords', id });

  it('an employee checks themselves in', async () => {
    // Self-service check-in on /my-attendance, which the permission matrix
    // gives Employee `full`. Refusing this would break the ordinary path.
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', attDoc()), attendance()),
    );
  });

  it('an employee cannot mark a colleague', async () => {
    // The hole this rule closes. Marking somebody present on a day they did
    // not work, or absent on one they did, moves what payroll pays them.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', attDoc('att-2')),
        attendance({ employeeId: 'emp-a9', id: 'att-2' }),
      ),
    );
  });

  // Product owner, 2026-09-23: only HR and Admin write somebody else's day.
  // It was any manager, and rules cannot tell a manager's own team from the
  // rest of the company, so any manager could move any colleague's pay.
  it('a manager CANNOT mark somebody else', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', attDoc('att-3')),
        attendance({ employeeId: 'emp-a9', id: 'att-3' }),
      ),
    );
  });

  it('a manager still checks themselves in', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.managerLinkedA), 'org_records', attDoc('att-3m')),
        attendance({ employeeId: 'emp-a2', id: 'att-3m' }),
      ),
    );
  });

  it('an administrator marks somebody else', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.adminA), 'org_records', attDoc('att-3a')),
        attendance({ employeeId: 'emp-a9', id: 'att-3a' }),
      ),
    );
  });

  it('HR marks somebody else', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'org_records', attDoc('att-4')),
        attendance({ employeeId: 'emp-a9', id: 'att-4' }),
      ),
    );
  });

  it('an unlinked account is no longer exempt, and cannot unlink itself to get there', async () => {
    // The exemption let an account with no employee_links document write
    // ANYBODY's day. `managerA` is unlinked: refused now.
    await assertFails(
      setDoc(
        doc(as(USERS.managerA), 'org_records', attDoc('att-u1')),
        attendance({ employeeId: 'emp-a9', id: 'att-u1' }),
      ),
    );
    // An unlinked HR account is an administrator, and still marks its org's.
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrB), 'org_records', docId({ org: 'org-b', store: 'attendanceRecords', id: 'att-b1' })),
        record({ org: 'org-b', store: 'attendanceRecords', id: 'att-b1', employeeId: 'emp-b9' }),
      ),
    );
    // And the exemption is not self-service: employee_links is isOrgAdmin()
    // for delete, so a linked employee cannot drop their link to reach it.
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'employee_links', USERS.employeeA.uid)));
  });

  it('an employee cannot rewrite their own record to somebody else', async () => {
    // The id says one person and the lifted field another. `isSelf` reads the
    // field the rules can see, so the mismatch is refused rather than filed
    // under whoever the id happens to name.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', attDoc('att-5')),
        attendance({ employeeId: 'emp-a9', id: 'att-5' }),
      ),
    );
  });

  it('another organisation cannot write attendance here', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeB), 'org_records', attDoc('att-6')), attendance({ id: 'att-6' })),
    );
  });

  it('a record with no employeeId falls to HR and Admin', async () => {
    // `.get('employeeId', '')` keeps a missing field from erroring the whole
    // rule. Nobody is "self" to an absent id, so it lands on isOrgAdmin().
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'org_records', attDoc('att-7')),
        record({ store: 'attendanceRecords', id: 'att-7' }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(as(USERS.hrA), 'org_records', attDoc('att-7')),
        record({ store: 'attendanceRecords', id: 'att-7' }),
      ),
    );
  });

  it('the attendance rule does not leak onto other stores', async () => {
    // An employee raising a ticket has no employeeId on it and must stay
    // able to write — the clause is keyed on the store name for that reason.
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'org_records', docId({ id: 'tkt-x' })), record({ id: 'tkt-x' })),
    );
  });
});
