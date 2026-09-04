/**
 * Subscriptions and trials — security-rules tests.
 *
 * The entire commercial model rests on one property, and it is a rules
 * property rather than a client one: **an organisation cannot alter its own
 * subscription.** The trial dates, the paid term, the override and the
 * suspension all live on `organizations/{orgId}`, which is readable by its own
 * tenant and writable only by a super admin. If that fails, a trial is a
 * suggestion — anybody with devtools extends their own indefinitely and the
 * whole feature is theatre.
 *
 * The second half is `subscription_requests`, which exists because the first
 * half means a tenant cannot pay. An org administrator may create a request and
 * read their own; only a super admin may read them all or close one. The
 * tenant asks and the platform grants, which is the only shape that is safe
 * without a server to receive a signed payment webhook.
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
import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  superAdmin: { uid: 'super', email: 'super@example.com', role: 'admin', orgId: 'org-a', superAdmin: true },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
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
        ...(user.superAdmin ? { superAdmin: true } : {}),
      });
    }
    await setDoc(doc(db, 'organizations', 'org-a'), {
      name: 'Org A',
      adminEmail: 'hr-a@example.com',
      createdBy: 'super',
      trialEndsAt: '2026-07-01T00:00:00.000Z',
      trialPricePaise: 100,
      graceDays: 3,
    });
    await setDoc(doc(db, 'organizations', 'org-b'), {
      name: 'Org B',
      adminEmail: 'hr-b@example.com',
      createdBy: 'super',
    });
  });
});

describe('an organisation cannot alter its own subscription', () => {
  it('an HR administrator may READ their own trial', async () => {
    // They have to: the countdown banner is built from it.
    const snapshot = await assertSucceeds(getDoc(doc(as(USERS.hrA), 'organizations', 'org-a')));
    if (snapshot.data().trialPricePaise !== 100) {
      throw new Error('the tenant should see the price it signed up under');
    }
  });

  it('an HR administrator cannot extend their own trial', async () => {
    // The whole feature is this assertion. Without it a trial is a suggestion.
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'organizations', 'org-a'), {
        trialEndsAt: '2099-01-01T00:00:00.000Z',
      }),
    );
  });

  it('an org admin cannot mark their own organisation paid', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.adminA), 'organizations', 'org-a'), {
        paidThrough: '2099-01-01T00:00:00.000Z',
      }),
    );
  });

  it('an org admin cannot comp themselves with an override', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.adminA), 'organizations', 'org-a'), {
        overrideUntil: '2099-01-01T00:00:00.000Z',
        overrideReason: 'we decided',
      }),
    );
  });

  it('an org admin cannot lift their own suspension', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', 'org-a'), {
        suspended: true,
        suspendedReason: 'Chargeback',
      });
    });
    await assertFails(
      updateDoc(doc(as(USERS.adminA), 'organizations', 'org-a'), { suspended: false }),
    );
  });

  it('an ordinary employee cannot write it either', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'organizations', 'org-a'), {
        trialEndsAt: '2099-01-01T00:00:00.000Z',
      }),
    );
  });

  it('another tenant cannot read it', async () => {
    // A competitor's trial dates and seat count are commercial information.
    await assertFails(getDoc(doc(as(USERS.hrB), 'organizations', 'org-a')));
  });

  it('a super admin can do all of it', async () => {
    const db = as(USERS.superAdmin);
    await assertSucceeds(
      updateDoc(doc(db, 'organizations', 'org-a'), {
        paidThrough: '2027-06-01T00:00:00.000Z',
        overrideUntil: '',
        suspended: false,
      }),
    );
  });
});

describe('subscription requests: the tenant asks, the platform grants', () => {
  const request = (over = {}) => ({
    orgId: 'org-a',
    kind: 'activate',
    reference: 'razorpay_pay_ABC123',
    note: 'Transfer made this morning.',
    requestedByUid: 'hr-a',
    requestedByEmail: 'hr-a@example.com',
    status: 'open',
    ...over,
  });

  it('an org administrator may raise one', async () => {
    await assertSucceeds(
      addDoc(collection(as(USERS.hrA), 'subscription_requests'), request()),
    );
  });

  it('an ordinary employee may not', async () => {
    await assertFails(
      addDoc(collection(as(USERS.employeeA), 'subscription_requests'), request({
        requestedByUid: 'employee-a',
        requestedByEmail: 'employee-a@example.com',
      })),
    );
  });

  it('a request cannot be created already actioned', async () => {
    // Granting nothing on its own, but it would empty the queue the platform
    // works from — so the tenant's own payment would never be looked at.
    await assertFails(
      addDoc(collection(as(USERS.hrA), 'subscription_requests'), request({ status: 'actioned' })),
    );
  });

  it('a request cannot be filed against another tenant', async () => {
    await assertFails(
      addDoc(collection(as(USERS.hrA), 'subscription_requests'), request({ orgId: 'org-b' })),
    );
  });

  it('a request cannot be attributed to somebody else', async () => {
    await assertFails(
      addDoc(collection(as(USERS.hrA), 'subscription_requests'), request({ requestedByUid: 'admin-a' })),
    );
  });

  it('an unknown kind is refused', async () => {
    await assertFails(
      addDoc(collection(as(USERS.hrA), 'subscription_requests'), request({ kind: 'grant-me-everything' })),
    );
  });

  it('a note cannot be a document', async () => {
    await assertFails(
      addDoc(collection(as(USERS.hrA), 'subscription_requests'), request({ note: 'x'.repeat(1001) })),
    );
  });

  it('a tenant reads its own queue, filtered on its own org', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subscription_requests', 'req-a'), request());
      await setDoc(doc(ctx.firestore(), 'subscription_requests', 'req-b'), request({ orgId: 'org-b' }));
    });
    const db = as(USERS.hrA);
    await assertSucceeds(
      getDocs(query(collection(db, 'subscription_requests'), where('orgId', '==', 'org-a'))),
    );
    // Unfiltered, the list is evaluated against org-b's document too and fails
    // whole — the same rule every tenant-scoped query in this app follows.
    await assertFails(getDocs(collection(db, 'subscription_requests')));
  });

  it('a tenant cannot close its own request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subscription_requests', 'req-a'), request());
    });
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'subscription_requests', 'req-a'), { status: 'actioned' }),
    );
    await assertFails(deleteDoc(doc(as(USERS.hrA), 'subscription_requests', 'req-a')));
  });

  it('a super admin reads every queue and closes a request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subscription_requests', 'req-a'), request());
      await setDoc(doc(ctx.firestore(), 'subscription_requests', 'req-b'), request({ orgId: 'org-b' }));
    });
    const db = as(USERS.superAdmin);
    await assertSucceeds(getDocs(collection(db, 'subscription_requests')));
    await assertSucceeds(
      updateDoc(doc(db, 'subscription_requests', 'req-a'), { status: 'actioned' }),
    );
  });
});
