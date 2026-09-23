/**
 * Support chat: an organisation's HR talks to the platform, and nobody else
 * reads it.
 *
 * The Super Admin cannot see an organisation's HR data (gate G3), so this is
 * how an HR Manager or Administrator reaches the platform. Asserted here:
 * who may open, read, reply to and resolve a thread; that a thread stays in
 * its organisation; that messages are append-only and signed by the side the
 * caller is actually on.
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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';

const USERS = {
  superA: { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
};

let testEnv;
const as = (user) => testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();

function thread(user, overrides = {}) {
  return {
    orgId: user.orgId,
    orgName: 'Org A',
    subject: 'Cannot upload payslips',
    status: 'open',
    createdByUid: user.uid,
    createdByEmail: user.email,
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessageBy: 'org',
    ...overrides,
  };
}

function message(user, side, overrides = {}) {
  return { authorUid: user.uid, authorEmail: user.email, authorSide: side, text: 'Hello', at: serverTimestamp(), ...overrides };
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const user of Object.values(USERS)) {
      const profile = { uid: user.uid, email: user.email, role: user.role };
      if (user.orgId) profile.orgId = user.orgId;
      if (user.superAdmin) profile.superAdmin = true;
      await setDoc(doc(db, 'users', user.uid), profile);
    }
    await setDoc(doc(db, 'support_threads', 't-a'), {
      orgId: 'org-a', subject: 'Existing', status: 'open', createdByUid: 'hr-a',
      createdAt: new Date(), lastMessageAt: new Date(), lastMessageBy: 'org',
    });
    await setDoc(doc(db, 'support_threads', 't-a', 'messages', 'm1'), {
      authorUid: 'hr-a', authorSide: 'org', text: 'First', at: new Date(),
    });
  });
});

describe('opening a conversation', () => {
  it('an HR Manager and an Administrator open one for their own organisation', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.hrA), 'support_threads', 'n1'), thread(USERS.hrA)));
    await assertSucceeds(setDoc(doc(as(USERS.adminA), 'support_threads', 'n2'), thread(USERS.adminA)));
  });

  it('not for another organisation, and not in somebody else’s name', async () => {
    await assertFails(setDoc(doc(as(USERS.hrA), 'support_threads', 'n1'), thread(USERS.hrA, { orgId: 'org-b' })));
    await assertFails(setDoc(doc(as(USERS.hrA), 'support_threads', 'n1'), thread(USERS.hrA, { createdByUid: 'admin-a' })));
  });

  it('a Manager, an Employee, the Super Admin and anybody signed out cannot', async () => {
    await assertFails(setDoc(doc(as(USERS.managerA), 'support_threads', 'n1'), thread(USERS.managerA)));
    await assertFails(setDoc(doc(as(USERS.employeeA), 'support_threads', 'n1'), thread(USERS.employeeA)));
    await assertFails(setDoc(doc(as(USERS.superA), 'support_threads', 'n1'), thread({ ...USERS.superA, orgId: 'org-a' })));
    await assertFails(setDoc(doc(anon(), 'support_threads', 'n1'), thread(USERS.hrA)));
  });

  it('a new thread is open, and carries nothing extra', async () => {
    await assertFails(setDoc(doc(as(USERS.hrA), 'support_threads', 'n1'), thread(USERS.hrA, { status: 'resolved' })));
    await assertFails(setDoc(doc(as(USERS.hrA), 'support_threads', 'n1'), thread(USERS.hrA, { priority: 'urgent' })));
  });
});

describe('reading', () => {
  it('the organisation’s administrators and the Super Admin read it', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'support_threads', 't-a')));
    await assertSucceeds(getDoc(doc(as(USERS.adminA), 'support_threads', 't-a')));
    await assertSucceeds(getDoc(doc(as(USERS.superA), 'support_threads', 't-a')));
    await assertSucceeds(getDocs(query(collection(as(USERS.hrA), 'support_threads'), where('orgId', '==', 'org-a'))));
    await assertSucceeds(getDocs(collection(as(USERS.superA), 'support_threads')));
    await assertSucceeds(getDocs(collection(as(USERS.hrA), 'support_threads', 't-a', 'messages')));
  });

  it('another organisation, a Manager, an Employee and anybody signed out do not', async () => {
    for (const user of [USERS.hrB, USERS.managerA, USERS.employeeA]) {
      await assertFails(getDoc(doc(as(user), 'support_threads', 't-a')));
      await assertFails(getDocs(collection(as(user), 'support_threads', 't-a', 'messages')));
    }
    await assertFails(getDocs(query(collection(as(USERS.hrB), 'support_threads'), where('orgId', '==', 'org-a'))));
    await assertFails(getDoc(doc(anon(), 'support_threads', 't-a')));
  });

  it('an unfiltered list by an organisation is denied', async () => {
    await assertFails(getDocs(collection(as(USERS.hrA), 'support_threads')));
  });
});

describe('replying', () => {
  it('each side replies as itself', async () => {
    const messages = (user) => collection(as(user), 'support_threads', 't-a', 'messages');
    await assertSucceeds(addDoc(messages(USERS.hrA), message(USERS.hrA, 'org')));
    await assertSucceeds(addDoc(messages(USERS.superA), message(USERS.superA, 'platform')));
  });

  it('nobody posts as the other side, or as somebody else', async () => {
    const messages = (user) => collection(as(user), 'support_threads', 't-a', 'messages');
    await assertFails(addDoc(messages(USERS.hrA), message(USERS.hrA, 'platform')));
    await assertFails(addDoc(messages(USERS.superA), message(USERS.superA, 'org')));
    await assertFails(addDoc(messages(USERS.hrA), message(USERS.hrA, 'org', { authorUid: 'admin-a' })));
  });

  it('another organisation and an Employee cannot reply', async () => {
    await assertFails(addDoc(collection(as(USERS.hrB), 'support_threads', 't-a', 'messages'), message(USERS.hrB, 'org')));
    await assertFails(addDoc(collection(as(USERS.employeeA), 'support_threads', 't-a', 'messages'), message(USERS.employeeA, 'org')));
  });

  it('a message is never edited or deleted', async () => {
    await assertFails(updateDoc(doc(as(USERS.hrA), 'support_threads', 't-a', 'messages', 'm1'), { text: 'Changed' }));
    await assertFails(deleteDoc(doc(as(USERS.superA), 'support_threads', 't-a', 'messages', 'm1')));
  });
});

describe('resolving', () => {
  it('either side resolves or reopens', async () => {
    await assertSucceeds(updateDoc(doc(as(USERS.superA), 'support_threads', 't-a'), { status: 'resolved' }));
    await assertSucceeds(updateDoc(doc(as(USERS.hrA), 'support_threads', 't-a'), { status: 'open' }));
  });

  it('but nothing else about a thread changes, and nobody deletes one', async () => {
    await assertFails(updateDoc(doc(as(USERS.hrA), 'support_threads', 't-a'), { orgId: 'org-b' }));
    await assertFails(updateDoc(doc(as(USERS.superA), 'support_threads', 't-a'), { subject: 'Rewritten' }));
    await assertFails(updateDoc(doc(as(USERS.hrB), 'support_threads', 't-a'), { status: 'resolved' }));
    await assertFails(deleteDoc(doc(as(USERS.superA), 'support_threads', 't-a')));
  });
});
