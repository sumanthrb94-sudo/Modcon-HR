/**
 * Employee handbook security-rules tests.
 *
 * The two claims the document-management module rests on:
 *   1. Only HR can publish. Not managers, not employees, and — as specified —
 *      not platform admins either.
 *   2. Every signed-in user can read, with no per-employee scoping applied.
 *
 * Neither is testable through the UI: the E2E suite drives the client, which
 * hides the upload panel for non-HR, so it would pass just as happily if the
 * rules let an employee publish the handbook. This file is the only thing that
 * checks the server.
 *
 * Run with `npm run test:rules`.
 *
 * That script passes `--test-concurrency=1`, which matters now that there is
 * more than one file here: every suite reseeds via `testEnv.clearFirestore()`,
 * which wipes the whole emulator, so two files running concurrently delete each
 * other's fixtures and fail at random.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  superA: { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b' },
  // Predates multi-org support, shown as it looks *after* the identity
  // backfill: stamped with the 'default' sentinel explicitly. An account with
  // no orgId at all is now unassigned and reads nothing — see G7 in
  // docs/tenant-isolation-spec.md.
  legacyEmployee: { uid: 'legacy-employee', email: 'legacy-employee@example.com', role: 'employee', orgId: 'default' },
};

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

/** A valid version payload, overridable per test. */
function version(overrides = {}) {
  return {
    id: 'v1-doc',
    orgId: 'org-a',
    version: 1,
    fileName: 'handbook.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    contentBase64: 'JVBERi0xLjQK',
    uploadedAt: '2026-07-30T10:00:00.000Z',
    uploadedByUid: USERS.hrA.uid,
    uploadedByName: 'HR A',
    uploadedByEmployeeId: 'emp-001',
    notes: 'Initial handbook',
    ...overrides,
  };
}

function pointer(overrides = {}) {
  return {
    orgId: 'org-a',
    currentVersionId: 'v1-doc',
    currentVersion: 1,
    updatedAt: '2026-07-30T10:00:00.000Z',
    updatedByUid: USERS.hrA.uid,
    ...overrides,
  };
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

/**
 * Reseed profiles plus one published handbook, bypassing rules. Each test gets
 * a clean store — these suites mutate shared state, and reusing it produces
 * false passes.
 */
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
    await setDoc(doc(db, 'handbook_versions', 'v1-doc'), version());
    await setDoc(doc(db, 'handbook', 'org-a'), pointer());
    // Another organisation's version, for the cross-org pointer test.
    await setDoc(doc(db, 'handbook_versions', 'v1-doc-b'), version({ id: 'v1-doc-b', orgId: 'org-b' }));
    await setDoc(doc(db, 'handbook', 'org-b'), pointer({ orgId: 'org-b', currentVersionId: 'v1-doc-b' }));
    // The legacy shape: `handbookOrgId` used to write null rather than the
    // 'default' sentinel. orgKeyOf() in the rules must read it as 'default'.
    await setDoc(doc(db, 'handbook_versions', 'v1-doc-legacy'), version({ id: 'v1-doc-legacy', orgId: null }));
  });
}

describe('handbook — read access within the organisation', () => {
  beforeEach(seed);

  it('an employee can read the current-version pointer', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'handbook', 'org-a')));
  });

  it('a manager can read a version document', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.managerA), 'handbook_versions', 'v1-doc')));
  });

  it('an employee can read the handbook regardless of record-level scoping', async () => {
    // dataScope.ts narrows an Employee to their own record for every other
    // people-data surface. The handbook is company policy and is deliberately
    // outside that: this asserts no visibility filter ever gets applied to it.
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'handbook_versions', 'v1-doc')));
    await assertSucceeds(getDoc(doc(as(USERS.employeeA), 'handbook', 'org-a')));
  });

  it('an unauthenticated visitor cannot read the handbook', async () => {
    await assertFails(getDoc(doc(anon(), 'handbook', 'org-a')));
    await assertFails(getDoc(doc(anon(), 'handbook_versions', 'v1-doc')));
  });
});

// ---------------------------------------------------------------------------
// Cross-organisation reads (I2 in docs/tenant-isolation-spec.md)
//
// The version document carries the PDF itself in `contentBase64`, so a
// cross-org read here is the whole handbook, not metadata about it. Both rules
// were `allow read: if isSignedIn()`; the write side was scoped from the start,
// which is what made the read side easy to miss.
// ---------------------------------------------------------------------------
describe('handbook — reads do not cross organisations', () => {
  beforeEach(seed);

  it("an employee of org B cannot read org A's version document", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'handbook_versions', 'v1-doc')));
  });

  it("HR of org B cannot read org A's version document", async () => {
    await assertFails(getDoc(doc(as(USERS.hrB), 'handbook_versions', 'v1-doc')));
  });

  it("an employee of org B cannot read org A's pointer", async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'handbook', 'org-a')));
  });

  it('an unfiltered list of versions is denied', async () => {
    await assertFails(getDocs(collection(as(USERS.employeeA), 'handbook_versions')));
  });

  it('a list filtered to my own organisation is allowed', async () => {
    await assertSucceeds(
      getDocs(query(collection(as(USERS.employeeA), 'handbook_versions'), where('orgId', '==', 'org-a'))),
    );
  });

  it("a list filtered to another organisation is denied", async () => {
    await assertFails(
      getDocs(query(collection(as(USERS.employeeA), 'handbook_versions'), where('orgId', '==', 'org-b'))),
    );
  });

  it('a super admin reads across organisations', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.superA), 'handbook_versions', 'v1-doc')));
    await assertSucceeds(getDoc(doc(as(USERS.superA), 'handbook', 'org-a')));
  });

  it('a null orgId reads as the default org, not as everyone', async () => {
    // The legacy shape stays readable by a legacy account…
    await assertSucceeds(getDoc(doc(as(USERS.legacyEmployee), 'handbook_versions', 'v1-doc-legacy')));
    // …and is not thereby readable by a real organisation.
    await assertFails(getDoc(doc(as(USERS.employeeA), 'handbook_versions', 'v1-doc-legacy')));
  });

  it('BACKFILL REQUIRED: a null-orgId version is invisible to the filtered query', async () => {
    // Permitted (above) but unreachable: `where('orgId','==','default')` matches
    // neither a missing field nor a null one. Same asymmetry as the orgId
    // backfill in docs/multi-tenancy-spec.md §4, which is why
    // handbook_versions is now in ORG_SCOPED_COLLECTIONS.
    const snap = await getDocs(
      query(collection(as(USERS.legacyEmployee), 'handbook_versions'), where('orgId', '==', 'default')),
    );
    if (snap.docs.some((d) => d.id === 'v1-doc-legacy')) {
      throw new Error('expected the null-orgId version to be invisible to the org-filtered query');
    }
  });
});

describe('handbook — who may publish', () => {
  beforeEach(seed);

  it('HR can create a version in their own organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'), version({ id: 'v2-doc', version: 2 })),
    );
  });

  it('HR can move the pointer to a version in their own organisation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2 }),
      );
    });
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'handbook', 'org-a'), pointer({ currentVersionId: 'v2-doc', currentVersion: 2 })),
    );
  });

  it('an employee cannot create a version', async () => {
    // The forged-local-role case: the client believes it is HR, the server
    // does not care what the client believes.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, uploadedByUid: USERS.employeeA.uid })),
    );
  });

  it('a manager cannot create a version', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, uploadedByUid: USERS.managerA.uid })),
    );
  });

  it('a platform admin can create a version', async () => {
    // Publishing is isOrgAdmin(), not isHR(): organisations created before the
    // HR role existed hold an `admin` account, and excluding admins would leave
    // them unable to publish at all. See spec §5.
    await assertSucceeds(
      setDoc(doc(as(USERS.adminA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, uploadedByUid: USERS.adminA.uid })),
    );
  });

  it('a platform admin can move the pointer', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.adminA), 'handbook', 'org-a'),
        pointer({ updatedByUid: USERS.adminA.uid })),
    );
  });

  it('an employee cannot move the pointer', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'handbook', 'org-a'),
        pointer({ updatedByUid: USERS.employeeA.uid })),
    );
  });
});

describe('handbook — integrity of the audit trail', () => {
  beforeEach(seed);

  it('HR cannot edit a published version', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'handbook_versions', 'v1-doc'), { notes: 'rewritten' }),
    );
  });

  it('HR cannot delete a version', async () => {
    await assertFails(deleteDoc(doc(as(USERS.hrA), 'handbook_versions', 'v1-doc')));
  });

  it('HR cannot delete the pointer', async () => {
    await assertFails(deleteDoc(doc(as(USERS.hrA), 'handbook', 'org-a')));
  });

  it('HR cannot forge the uploader', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, uploadedByUid: USERS.employeeA.uid })),
    );
  });

  it('a version document id must match its id field', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'), version({ id: 'something-else', version: 2 })),
    );
  });

  it('rejects a non-PDF content type', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, contentType: 'text/html' })),
    );
  });

  it('rejects a file over the size ceiling', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, sizeBytes: 737281 })),
    );
  });

  it('rejects notes longer than the limit', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, notes: 'x'.repeat(501) })),
    );
  });
});

describe('handbook — organisation isolation', () => {
  beforeEach(seed);

  it('HR cannot file a version under another organisation', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook_versions', 'v2-doc'),
        version({ id: 'v2-doc', version: 2, orgId: 'org-b' })),
    );
  });

  it("HR cannot point their org's handbook at another org's version", async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook', 'org-a'), pointer({ currentVersionId: 'v1-doc-b' })),
    );
  });

  it("HR cannot write another organisation's pointer document", async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'handbook', 'org-a'), pointer({ orgId: 'org-b', updatedByUid: USERS.hrB.uid })),
    );
  });

  it("a super admin cannot publish into a specific org's handbook", async () => {
    // Super admins carry role 'admin' and so satisfy isOrgAdmin(), but they
    // have no orgId of their own — handbookOrgKey() resolves to 'default' for
    // them, so they cannot write org-a's pointer. Without this the widening to
    // isOrgAdmin() would have handed every org's handbook to the super admin.
    await assertFails(
      setDoc(doc(as(USERS.superA), 'handbook', 'org-a'), pointer({ updatedByUid: USERS.superA.uid })),
    );
  });

  it('the pointer cannot name a version that does not exist', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'handbook', 'org-a'), pointer({ currentVersionId: 'no-such-version' })),
    );
  });
});
