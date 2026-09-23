/**
 * Platform audit log — security-rules tests.
 *
 * A super admin stepping into an organisation is the most consequential act
 * on this platform: from that moment the whole tenant app renders for them
 * against a company they do not work for. `inMyOrg()` is what stops them
 * reading a company they have NOT opened (see super-admin-boundary); this
 * collection is what makes opening one leave a mark.
 *
 * The three properties worth testing are the ones that make it an audit log
 * rather than a table somebody writes to:
 *
 *   1. An entry can only be filed about yourself. An audit trail that accepts
 *      an entry in somebody else's name is a place to plant evidence.
 *   2. The moment is the server's, not the device's.
 *   3. It is append-only for EVERYONE, super admins included. An actor who
 *      can edit the record of what they did has not been audited.
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
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, serverTimestamp, updateDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  superA: { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true },
  superB: { uid: 'super-b', email: 'super-b@example.com', role: 'admin', superAdmin: true },
  // An organisation's own administrator. Powerful inside their tenant and
  // nothing at all here.
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  // An organisation's Administrator: the one tenant role that reads its own
  // organisation's entries (product decision, 2026-09-23).
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  adminB: { uid: 'admin-b', email: 'admin-b@example.com', role: 'admin', orgId: 'org-b' },
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}
const anon = () => testEnv.unauthenticatedContext().firestore();

/** An entry as src/lib/auditLog.ts writes it. */
function entry(overrides = {}) {
  return {
    actorUid: USERS.superA.uid,
    actorEmail: USERS.superA.email,
    at: serverTimestamp(),
    action: 'super_admin.enter_org',
    orgId: 'org-a',
    orgName: 'Org A',
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
    // An existing entry for the immutability and read tests.
    await setDoc(doc(db, 'audit_logs', 'existing'), {
      actorUid: USERS.superA.uid,
      actorEmail: USERS.superA.email,
      at: new Date('2026-09-01T00:00:00Z'),
      action: 'super_admin.enter_org',
      orgId: 'org-a',
      orgName: 'Org A',
    });
  });
});

describe('writing an entry', () => {
  it('a super admin files one about themselves', async () => {
    await assertSucceeds(setDoc(doc(as(USERS.superA), 'audit_logs', 'e1'), entry()));
  });

  it('but not in somebody else’s name', async () => {
    // The first thing an audit trail has to refuse. Without this the
    // collection is a place to plant evidence rather than a record.
    await assertFails(
      setDoc(doc(as(USERS.superB), 'audit_logs', 'e2'), entry({ actorUid: USERS.superA.uid })),
    );
  });

  it('and not with a time of their own choosing', async () => {
    // `request.time` or nothing. A device clock does not get a vote on when
    // an organisation was opened — the same rule attendance_stamps applies
    // to `recordedAt`, and for the same reason.
    await assertFails(
      setDoc(doc(as(USERS.superA), 'audit_logs', 'e3'), entry({ at: new Date('2020-01-01T00:00:00Z') })),
    );
  });

  it('an organisation’s own administrator cannot file one', async () => {
    // HR is an administrator of their tenant and nothing on the platform.
    // If they could write here they could manufacture a record of the
    // platform operator entering their org.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'audit_logs', 'e4'), entry({ actorUid: USERS.hrA.uid })),
    );
  });

  it('nor can an employee, nor anybody signed out', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'audit_logs', 'e5'), entry({ actorUid: USERS.employeeA.uid })),
    );
    await assertFails(setDoc(doc(anon(), 'audit_logs', 'e6'), entry()));
  });

  it('an entry carrying keys nobody reads is refused', async () => {
    // The key set is closed so an audit row cannot double as a way to smuggle
    // a payload across the tenant boundary.
    await assertFails(
      setDoc(doc(as(USERS.superA), 'audit_logs', 'e7'), entry({ payload: 'anything at all' })),
    );
  });

  it('and one that does not say what happened, or to whom', async () => {
    await assertFails(setDoc(doc(as(USERS.superA), 'audit_logs', 'e8'), entry({ action: '' })));
    const { orgId: _omitted, ...withoutOrg } = entry();
    await assertFails(setDoc(doc(as(USERS.superA), 'audit_logs', 'e9'), withoutOrg));
  });
});

describe('an entry cannot be rewritten', () => {
  // Append-only for everyone, super admins included. An actor who can edit
  // the record of what they did has not been audited. Same rule and same
  // sentence as handbook_versions.
  it('not by the super admin who wrote it', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.superA), 'audit_logs', 'existing'), { action: 'something else' }),
    );
  });

  it('not by another super admin', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.superB), 'audit_logs', 'existing'), { orgId: 'org-b' }),
    );
  });

  it('and nobody deletes one', async () => {
    await assertFails(deleteDoc(doc(as(USERS.superA), 'audit_logs', 'existing')));
    await assertFails(deleteDoc(doc(as(USERS.hrA), 'audit_logs', 'existing')));
  });
});

describe('reading the log', () => {
  it('a super admin reads it', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.superA), 'audit_logs', 'existing')));
  });

  it('an HR Manager, an employee and anybody signed out do not', async () => {
    // The product owner restricted it to Super Admin and Administrator: HR
    // administers the organisation but is not shown who administered it.
    await assertFails(getDoc(doc(as(USERS.hrA), 'audit_logs', 'existing')));
    await assertFails(getDoc(doc(as(USERS.employeeA), 'audit_logs', 'existing')));
    await assertFails(getDoc(doc(anon(), 'audit_logs', 'existing')));
  });

  it("an organisation's Administrator reads its own organisation's entries", async () => {
    await assertSucceeds(getDoc(doc(as(USERS.adminA), 'audit_logs', 'existing')));
    await assertSucceeds(
      getDocs(query(collection(as(USERS.adminA), 'audit_logs'), where('orgId', '==', 'org-a'))),
    );
  });

  it("but never another organisation's, and not unfiltered", async () => {
    await assertFails(getDoc(doc(as(USERS.adminB), 'audit_logs', 'existing')));
    await assertFails(
      getDocs(query(collection(as(USERS.adminB), 'audit_logs'), where('orgId', '==', 'org-a'))),
    );
    await assertFails(getDocs(collection(as(USERS.adminA), 'audit_logs')));
  });

  it('and still cannot write one', async () => {
    await assertFails(setDoc(doc(as(USERS.adminA), 'audit_logs', 'forged'), entry({ actorUid: USERS.adminA.uid })));
  });
});
