/**
 * Rules closed by the October 2026 audit — security-rules tests.
 *
 * Each block is one finding, asserted from the attacker's side:
 *
 *   1. Board replies were readable and writable across organisations: the
 *      `comments` subcollection had no tenant check of its own.
 *   2. `demo_requests` accepted any document from anybody, which is a quota
 *      outage waiting for a script.
 *   3. A self-written profile could carry somebody else's address, and role
 *      grants are matched by address.
 *   4. The `admin` role reached every organisation's accounts.
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
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b' },
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
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

beforeEach(async () => {
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
    }
    await setDoc(doc(db, 'org_posts', 'post-a'), { orgId: 'org-a', kind: 'post', body: 'Hello', authorUid: 'employee-a' });
    await setDoc(doc(db, 'org_posts', 'post-a', 'comments', 'c-1'), {
      authorUid: 'employee-a',
      body: 'First',
      createdAt: new Date('2026-09-01T04:00:00Z'),
    });
  });
});

describe('board replies belong to the post’s organisation', () => {
  it('its own organisation reads and replies', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'org_posts', 'post-a', 'comments', 'c-1')));
    await assertSucceeds(
      addDoc(collection(as(USERS.employeeA), 'org_posts', 'post-a', 'comments'), {
        authorUid: USERS.employeeA.uid,
        body: 'Agreed',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('another organisation can neither read nor post into it', async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'org_posts', 'post-a', 'comments', 'c-1')));
    await assertFails(getDocs(collectionGroup(as(USERS.employeeB), 'comments')));
    await assertFails(
      addDoc(collection(as(USERS.employeeB), 'org_posts', 'post-a', 'comments'), {
        authorUid: USERS.employeeB.uid,
        body: 'Spam',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('demo requests have one bounded shape', () => {
  const lead = (extra = {}) => ({
    fullName: 'Asha Rao',
    companyName: 'Rao Builders',
    workEmail: 'asha@rao.example',
    phone: '+91 98450 00000',
    teamSize: '11-50',
    preferredSlot: 'Weekday morning',
    message: '',
    status: 'New',
    createdAt: serverTimestamp(),
    createdAtIso: '2026-10-21T04:00:00.000Z',
    ...extra,
  });
  const anon = () => testEnv.unauthenticatedContext().firestore();

  it('the landing form’s request lands', async () => {
    await assertSucceeds(addDoc(collection(anon(), 'demo_requests'), lead()));
  });

  it('anything else is refused', async () => {
    await assertFails(addDoc(collection(anon(), 'demo_requests'), lead({ status: 'Converted' })));
    await assertFails(addDoc(collection(anon(), 'demo_requests'), lead({ junk: 'x' })));
    await assertFails(addDoc(collection(anon(), 'demo_requests'), lead({ message: 'x'.repeat(5000) })));
    await assertFails(addDoc(collection(anon(), 'demo_requests'), lead({ createdAt: new Date('2020-01-01') })));
  });
});

describe('a self-written profile carries its own address', () => {
  it('rewriting your email to a colleague’s is refused', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { email: 'boss@example.com' }),
    );
    await assertSucceeds(
      updateDoc(doc(as(USERS.employeeA), 'users', USERS.employeeA.uid), { email: USERS.employeeA.email, displayName: 'A' }),
    );
  });
});

describe('an organisation admin administers one organisation', () => {
  it('reads and edits its own accounts', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.adminA), 'users', USERS.employeeA.uid)));
    await assertSucceeds(
      updateDoc(doc(as(USERS.adminA), 'users', USERS.employeeA.uid), { role: 'manager' }),
    );
  });

  it('not another organisation’s', async () => {
    await assertFails(getDoc(doc(as(USERS.adminA), 'users', USERS.employeeB.uid)));
    await assertFails(
      updateDoc(doc(as(USERS.adminA), 'users', USERS.employeeB.uid), { role: 'hr' }),
    );
    await assertFails(
      setDoc(doc(as(USERS.adminA), 'users', 'new-b'), {
        uid: 'new-b', email: 'new-b@example.com', displayName: 'x', role: 'employee', orgId: 'org-b',
      }),
    );
    await assertFails(
      setDoc(doc(as(USERS.adminA), 'employee_links', USERS.employeeB.uid), {
        uid: USERS.employeeB.uid, employeeId: 'emp-x', orgId: 'org-b',
      }),
    );
  });

  it('and does not move its own accounts into one', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.adminA), 'users', USERS.employeeA.uid), { orgId: 'org-b' }),
    );
  });
});
