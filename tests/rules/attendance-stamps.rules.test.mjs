/**
 * Geofenced-attendance security-rules tests.
 *
 * These are the tests that decide whether the feature is worth anything. The
 * app-side checks in src/data/geofenceRules.ts are an affordance — they tell
 * an employee why their check-in was refused and they draw the right controls.
 * Anyone can open devtools and call `setDoc` directly, so every claim below is
 * only true because these rules say so:
 *
 *   1. A stamp is written by the employee it is about, and by nobody else. A
 *      manager cannot manufacture one; a colleague cannot file one against you.
 *   2. A stamp is IMMUTABLE to its author. There is no update an employee can
 *      make. A check-in recorded 4 km from the office stays recorded 4 km from
 *      the office — this is the single property the whole feature rests on.
 *   3. `outcome: 'inside'` is recomputed against the organisation's OWN fence,
 *      read from `attendance_geofences/{orgKey}`. Claiming to be inside while
 *      sending coordinates in another city is refused, as is naming a site the
 *      organisation never drew.
 *   4. HR's finding can only be added by an administrator, only to the review
 *      field, and never by the employee the stamp is about.
 *   5. Tenants are separated: org B's administrator reads none of org A's
 *      stamps and writes none of its fences.
 *
 * What is deliberately NOT claimed anywhere here: that the coordinates are
 * true. Nothing in a browser or in these rules can establish that. See the
 * block comment on `attendance_stamps` in firestore.rules.
 *
 * Run with `npm run test:rules`.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  collection,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a3' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a1' },
  colleagueA: { uid: 'colleague-a', email: 'colleague-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a2' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  employeeB: { uid: 'employee-b', email: 'employee-b@example.com', role: 'employee', orgId: 'org-b', employeeId: 'emp-b1' },
};

// ModCon Builders' head office. metresPerDegreeLng = 111320·cos(12.9716°).
const HQ = {
  lat: 12.9716,
  lng: 77.5946,
  radiusMetres: 200,
  metresPerDegreeLng: 111320 * Math.cos((12.9716 * Math.PI) / 180),
};

// ~330 m due north of HQ: outside a 200 m fence, and close enough that the
// projection rather than a rounding accident is what decides it.
const NEAR_MISS = { lat: 12.9716 + 0.003, lng: 77.5946 };
// Inside, comfortably.
const INSIDE = { lat: 12.9716 + 0.0005, lng: 77.5946 };

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

function stamp(overrides = {}) {
  return {
    id: 'org-a__emp-a1__2026-09-03__in',
    orgId: 'org-a',
    employeeId: 'emp-a1',
    date: '2026-09-03',
    kind: 'in',
    recordedAt: serverTimestamp(),
    lat: INSIDE.lat,
    lng: INSIDE.lng,
    accuracyMetres: 12,
    siteId: 'site-hq',
    siteName: 'Head Office',
    distanceMetres: 55,
    outcome: 'inside',
    mode: 'enforced',
    signals: [],
    employeeUid: USERS.employeeA.uid,
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

/**
 * Reseed profiles, employee links, both organisations' fences and one existing
 * stamp, bypassing rules.
 *
 * Every test reseeds: these suites mutate stamps and reviews, and shared state
 * between them produces false passes.
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
    await setDoc(doc(db, 'attendance_geofences', 'org-a'), {
      orgId: 'org-a',
      mode: 'enforced',
      maxAccuracyMetres: 120,
      sites: { 'site-hq': HQ },
    });
    await setDoc(doc(db, 'attendance_geofences', 'org-b'), {
      orgId: 'org-b',
      mode: 'advisory',
      maxAccuracyMetres: 120,
      sites: { 'site-b': { ...HQ, lat: 19.076, metresPerDegreeLng: 111320 * Math.cos((19.076 * Math.PI) / 180) } },
    });
    // An existing stamp for org A, so the immutability and review tests have
    // something already filed to attack.
    // Seeded with coordinates that genuinely are outside the fence. An earlier
    // version of this seed left `INSIDE` on an `outcome: 'outside'` stamp, so
    // the "an admin cannot rewrite where it says somebody was" test below was
    // writing lat/lng values identical to the stored ones — `affectedKeys()`
    // saw only `review` change and the update rightly succeeded. The test
    // passed for the wrong reason and would have gone on passing with the
    // immutability check deleted.
    await setDoc(doc(db, 'attendance_stamps', 'org-a__emp-a1__2026-09-02__in'), {
      ...stamp({ id: 'org-a__emp-a1__2026-09-02__in', date: '2026-09-02' }),
      recordedAt: new Date('2026-09-02T03:30:00Z'),
      lat: NEAR_MISS.lat,
      lng: NEAR_MISS.lng,
      outcome: 'outside',
      distanceMetres: 4100,
      signals: ['impossible-accuracy'],
    });
    await setDoc(doc(db, 'attendance_stamps', 'org-b__emp-b1__2026-09-02__in'), {
      ...stamp({ id: 'org-b__emp-b1__2026-09-02__in', orgId: 'org-b', employeeId: 'emp-b1' }),
      recordedAt: new Date('2026-09-02T03:30:00Z'),
      employeeUid: USERS.employeeB.uid,
    });
  });
}

beforeEach(seed);

describe('filing a stamp', () => {
  it('an employee files their own', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'attendance_stamps', stamp().id), stamp()),
    );
  });

  it('a colleague cannot file one against somebody else', async () => {
    // A captured position is evidence that a particular person was somewhere.
    // Letting a third party produce it makes it an assertion again.
    await assertFails(
      setDoc(doc(as(USERS.colleagueA), 'attendance_stamps', stamp().id), stamp()),
    );
  });

  it('a manager cannot file one for a report', async () => {
    await assertFails(
      setDoc(doc(as(USERS.managerA), 'attendance_stamps', stamp().id), stamp()),
    );
  });

  it('HR cannot manufacture a stamp either', async () => {
    // Deliberate: an administrator recording somebody's day is what
    // Attendance → Mark Attendance is for, and that writes hand-entered times
    // without pretending they were captured.
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'attendance_stamps', stamp().id), stamp()),
    );
  });

  it('the author uid cannot be forged', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({ employeeUid: USERS.hrA.uid }),
      ),
    );
  });

  it('the recorded moment must be the server’s, not the device’s', async () => {
    // Otherwise a check-in at 11:00 files itself as 08:55.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({ recordedAt: '2026-09-03T03:25:00.000Z' }),
      ),
    );
  });

  it('the document id must agree with the employee, day and kind inside it', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', 'org-a__emp-a1__2026-09-03__in'),
        stamp({ date: '2026-09-04' }),
      ),
    );
  });

  it('a stamp cannot arrive already reviewed', async () => {
    // Filing one that carries HR's blessing is the whole attack.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({
          review: {
            verdict: 'genuine',
            note: 'looks fine to me',
            reviewedAt: '2026-09-03T04:00:00.000Z',
            reviewedByUid: USERS.employeeA.uid,
            reviewedByName: 'Me',
          },
        }),
      ),
    );
  });

  it('a stamp cannot be filed into another organisation', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', 'org-b__emp-a1__2026-09-03__in'),
        stamp({ id: 'org-b__emp-a1__2026-09-03__in', orgId: 'org-b' }),
      ),
    );
  });
});

describe('the inside claim is recomputed against the organisation’s own fence', () => {
  it('refuses "inside" when the coordinates are outside the named site', async () => {
    // The attack the whole rule exists for: honest-looking document, verdict
    // asserted by the client, coordinates that contradict it.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({ lat: NEAR_MISS.lat, lng: NEAR_MISS.lng, distanceMetres: 5 }),
      ),
    );
  });

  it('refuses "inside" for coordinates in another city', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({ lat: 28.6139, lng: 77.209, distanceMetres: 0 }),
      ),
    );
  });

  it('refuses "inside" against a site the organisation never drew', async () => {
    // Reading the site out of the org's own projection is what closes this:
    // the caller cannot supply the geometry it is judged by.
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({ siteId: 'site-invented' }),
      ),
    );
  });

  it('refuses "inside" against another organisation’s site', async () => {
    await assertFails(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({ siteId: 'site-b' }),
      ),
    );
  });

  it('accepts an honest "outside" without consulting the fence', async () => {
    // Claims against the employee's own interest need no defending, and a
    // stricter rule would refuse honest stamps from an org whose fence moved.
    await assertSucceeds(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({
          outcome: 'outside',
          lat: NEAR_MISS.lat,
          lng: NEAR_MISS.lng,
          distanceMetres: 332,
        }),
      ),
    );
  });

  it('accepts "unavailable" with no coordinates at all', async () => {
    await assertSucceeds(
      setDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', stamp().id),
        stamp({
          outcome: 'unavailable',
          lat: null,
          lng: null,
          accuracyMetres: null,
          siteId: null,
          siteName: null,
          distanceMetres: null,
        }),
      ),
    );
  });

  it('refuses "inside" when the organisation has no fence projection at all', async () => {
    // Fail closed. A missing projection means the server cannot check the
    // claim, and an unchecked claim is exactly what this collection is for.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'attendance_geofences', 'org-a'), { orgId: 'org-a', sites: {} });
    });
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'attendance_stamps', stamp().id), stamp()),
    );
  });
});

describe('a filed stamp is immutable to its author', () => {
  const filed = 'org-a__emp-a1__2026-09-02__in';

  it('the employee cannot move a stamp inside the fence after the fact', async () => {
    // THE property. A check-in recorded 4 km out stays recorded 4 km out.
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'attendance_stamps', filed), {
        outcome: 'inside',
        lat: INSIDE.lat,
        lng: INSIDE.lng,
        distanceMetres: 55,
      }),
    );
  });

  it('the employee cannot clear the flags raised against it', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.employeeA), 'attendance_stamps', filed), { signals: [] }),
    );
  });

  it('the employee cannot delete it', async () => {
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'attendance_stamps', filed), stamp(), { merge: true }),
    );
  });

  it('even an administrator cannot rewrite where it says somebody was', async () => {
    // Without the affectedKeys check, "review this stamp" would double as
    // "correct where it says I was" for anyone who is also an org admin.
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'attendance_stamps', filed), {
        lat: INSIDE.lat,
        lng: INSIDE.lng,
        review: {
          verdict: 'genuine',
          note: 'fixed it',
          reviewedAt: '2026-09-03T04:00:00.000Z',
          reviewedByUid: USERS.hrA.uid,
          reviewedByName: 'HR A',
        },
      }),
    );
  });
});

describe('recording a finding', () => {
  const filed = 'org-a__emp-a1__2026-09-02__in';

  function review(overrides = {}) {
    return {
      review: {
        verdict: 'falsified',
        note: 'Confirmed with the site supervisor that they were not on site.',
        reviewedAt: '2026-09-03T04:00:00.000Z',
        reviewedByUid: USERS.hrA.uid,
        reviewedByName: 'HR A',
        ...overrides,
      },
    };
  }

  it('HR records one', async () => {
    await assertSucceeds(updateDoc(doc(as(USERS.hrA), 'attendance_stamps', filed), review()));
  });

  it('a platform admin records one', async () => {
    await assertSucceeds(
      updateDoc(
        doc(as(USERS.adminA), 'attendance_stamps', filed),
        review({ reviewedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('the employee cannot clear their own flag', async () => {
    await assertFails(
      updateDoc(
        doc(as(USERS.employeeA), 'attendance_stamps', filed),
        review({ verdict: 'genuine', reviewedByUid: USERS.employeeA.uid }),
      ),
    );
  });

  it('a manager cannot record one', async () => {
    await assertFails(
      updateDoc(
        doc(as(USERS.managerA), 'attendance_stamps', filed),
        review({ reviewedByUid: USERS.managerA.uid }),
      ),
    );
  });

  it('the reviewer cannot be forged', async () => {
    await assertFails(
      updateDoc(
        doc(as(USERS.hrA), 'attendance_stamps', filed),
        review({ reviewedByUid: USERS.adminA.uid }),
      ),
    );
  });

  it('an unrecognised verdict is refused', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.hrA), 'attendance_stamps', filed), review({ verdict: 'guilty' })),
    );
  });

  it('another organisation’s administrator cannot review it', async () => {
    await assertFails(
      updateDoc(
        doc(as(USERS.hrB), 'attendance_stamps', filed),
        review({ reviewedByUid: USERS.hrB.uid }),
      ),
    );
  });
});

describe('reading stamps', () => {
  it('an employee reads their own', async () => {
    await assertSucceeds(
      getDoc(doc(as(USERS.employeeA), 'attendance_stamps', 'org-a__emp-a1__2026-09-02__in')),
    );
  });

  it('a colleague cannot read somebody else’s', async () => {
    await assertFails(
      getDoc(doc(as(USERS.colleagueA), 'attendance_stamps', 'org-a__emp-a1__2026-09-02__in')),
    );
  });

  it('an employee’s list must filter on their own employee id', async () => {
    const db = as(USERS.employeeA);
    // A list is evaluated against every document it returns and fails whole
    // otherwise, so the org-only query is denied rather than merely wasteful.
    await assertFails(
      getDocs(query(collection(db, 'attendance_stamps'), where('orgId', '==', 'org-a'))),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'attendance_stamps'),
          where('orgId', '==', 'org-a'),
          where('employeeId', '==', 'emp-a1'),
        ),
      ),
    );
  });

  it('HR lists the whole organisation’s', async () => {
    await assertSucceeds(
      getDocs(query(collection(as(USERS.hrA), 'attendance_stamps'), where('orgId', '==', 'org-a'))),
    );
  });

  it('another organisation’s HR reads none of them', async () => {
    await assertFails(
      getDoc(doc(as(USERS.hrB), 'attendance_stamps', 'org-a__emp-a1__2026-09-02__in')),
    );
    await assertFails(
      getDocs(query(collection(as(USERS.hrB), 'attendance_stamps'), where('orgId', '==', 'org-a'))),
    );
  });
});

describe('the fence projection', () => {
  it('HR writes their own organisation’s', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.hrA), 'attendance_geofences', 'org-a'), {
        orgId: 'org-a',
        mode: 'enforced',
        maxAccuracyMetres: 120,
        sites: { 'site-hq': HQ },
      }),
    );
  });

  it('an employee cannot draw a fence around themselves', async () => {
    // The obvious attack once the stamp rule reads the projection: move the
    // fence rather than the position.
    await assertFails(
      setDoc(doc(as(USERS.employeeA), 'attendance_geofences', 'org-a'), {
        orgId: 'org-a',
        mode: 'enforced',
        maxAccuracyMetres: 120,
        sites: { 'site-hq': { ...HQ, lat: 28.6139, lng: 77.209 } },
      }),
    );
  });

  it('HR cannot write another organisation’s fence', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrB), 'attendance_geofences', 'org-a'), {
        orgId: 'org-a',
        mode: 'off',
        maxAccuracyMetres: 120,
        sites: {},
      }),
    );
  });

  it('the document id must agree with the orgId inside it', async () => {
    await assertFails(
      setDoc(doc(as(USERS.hrA), 'attendance_geofences', 'org-a'), {
        orgId: 'org-b',
        mode: 'off',
        maxAccuracyMetres: 120,
        sites: {},
      }),
    );
  });

  it('a member reads their own organisation’s fence', async () => {
    // The client checks the same fence the server will judge it against, so it
    // never offers a button the server will refuse.
    const snap = await assertSucceeds(
      getDoc(doc(as(USERS.employeeA), 'attendance_geofences', 'org-a')),
    );
    assert.equal(snap.data().mode, 'enforced');
  });

  it('another organisation’s member cannot read it', async () => {
    await assertFails(getDoc(doc(as(USERS.employeeB), 'attendance_geofences', 'org-a')));
  });
});
