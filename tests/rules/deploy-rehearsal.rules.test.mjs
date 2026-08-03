/**
 * Rules deploy rehearsal — what shipping this ruleset does to live accounts.
 *
 * Every other suite here runs one ruleset against fixtures built for it, and
 * answers "are these rules correct". That is not the question you have to
 * answer the moment before `firebase deploy --only firestore:rules`. That
 * question is **what changes for accounts and data that already exist**, and it
 * is a comparison, not a property — so it needs two rulesets and a fixture
 * shaped like production rather than like a test.
 *
 * Three changes are sitting in the working tree unreleased
 * (`git diff 61339dd HEAD -- firestore.rules`):
 *
 *   1. G7      — an account with no `orgId` resolves to '~unassigned~' rather
 *                than 'default'. Fails closed, and locks out every account that
 *                has not been stamped by the identity backfill.
 *   2. Invites — an administrator creating an account must stamp it with an
 *                organisation; `users` create refuses otherwise.
 *   3. Identity — `role_assignments` and `employee_links` reads are split
 *                get/list and org-scoped, closing a cross-tenant list.
 *
 * They deploy together, because there is one ruleset and one deploy
 * (docs/tenant-isolation-spec.md §4.1). So (1)'s lockout is not a risk you can
 * defer by shipping (3) alone, and this suite says so with assertions rather
 * than with prose.
 *
 * The baseline is a git snapshot, not the live ruleset — reading that needs
 * `firebase login` and the Rules API. See fixtures/README.md.
 *
 * Run with `npm run test:rules` (serialised — see handbook.rules.test.mjs).
 */
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

/** The ruleset about to be deployed. */
const PENDING = readFileSync('firestore.rules', 'utf8');
/** The ruleset believed to be serving today. */
const DEPLOYED = readFileSync('tests/rules/fixtures/deployed-baseline-61339dd.rules', 'utf8');

/**
 * The legacy organisation, as it exists in production: accounts and documents
 * that predate multi-tenancy. Whether the accounts carry `orgId: 'default'` is
 * the whole variable — that stamp is what `backfillIdentityOrgIds` writes, and
 * what §10 step 3 has to have run before step 5 is safe.
 */
const LEGACY_HR = { uid: 'legacy-hr', email: 'hr@modconbuilders.test', role: 'hr' };
const LEGACY_EMPLOYEE = { uid: 'legacy-emp', email: 'staff@modconbuilders.test', role: 'employee' };

/** A second, properly provisioned organisation — already stamped throughout. */
const ORG_TWO = 'org-two';
const TWO_HR = { uid: 'two-hr', email: 'hr@two.test', role: 'hr', orgId: ORG_TWO };

const SUPER = { uid: 'super-1', email: 'super@modcon.test', role: 'admin', superAdmin: true };

/** Collections a legacy account reads on an ordinary day. */
const EVERYDAY = ['employees', 'attendance', 'payroll_runs', 'jobs', 'assets'];

function as(env, user) {
  return env.authenticatedContext(user.uid, { email: user.email }).firestore();
}

/**
 * A production-shaped database.
 *
 * `identityStamped` is the migration state: false is what production looks like
 * before Settings → Database → "Backfill organization IDs" has been run for the
 * legacy organisation, true is after.
 *
 * Both a *stamped* and an *unstamped* legacy document are written, because they
 * are different cases and only one of them is about permission: an unstamped
 * document is readable by its own tenant (`orgKeyOf` reads absent as 'default')
 * but matches no equality filter, which is the "permitted but invisible"
 * asymmetry the data backfill exists to repair. The account stamp is the one
 * that decides access.
 */
async function seedProductionShape(env, identityStamped) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    const legacyOrgId = identityStamped ? { orgId: 'default' } : {};
    for (const user of [LEGACY_HR, LEGACY_EMPLOYEE]) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid, email: user.email, role: user.role, ...legacyOrgId,
      });
    }
    await setDoc(doc(db, 'users', TWO_HR.uid), {
      uid: TWO_HR.uid, email: TWO_HR.email, role: TWO_HR.role, orgId: ORG_TWO,
    });
    await setDoc(doc(db, 'users', SUPER.uid), {
      uid: SUPER.uid, email: SUPER.email, role: SUPER.role, superAdmin: true,
    });

    for (const name of EVERYDAY) {
      // Written before multi-tenancy: no orgId at all.
      await setDoc(doc(db, name, 'legacy-doc'), { id: 'legacy-doc', label: 'legacy record' });
      // Written since, or repaired by the data backfill.
      await setDoc(doc(db, name, 'stamped-doc'), { id: 'stamped-doc', orgId: 'default', label: 'stamped record' });
      // The second organisation's.
      await setDoc(doc(db, name, 'two-doc'), { id: 'two-doc', orgId: ORG_TWO, label: 'org two record' });
    }

    await setDoc(doc(db, 'org_settings', 'default__leavePolicies'), {
      orgId: 'default', key: 'leavePolicies', valueJson: '[]',
    });
    await setDoc(doc(db, 'org_settings', `${ORG_TWO}__leavePolicies`), {
      orgId: ORG_TWO, key: 'leavePolicies', valueJson: '[]',
    });

    // The access-mapping plane, for the identity-list change.
    await setDoc(doc(db, 'employee_links', LEGACY_EMPLOYEE.uid), {
      uid: LEGACY_EMPLOYEE.uid, employeeId: 'emp-001', orgId: 'default',
    });
    await setDoc(doc(db, 'employee_links', 'two-emp'), {
      uid: 'two-emp', employeeId: 'two-emp-1', orgId: ORG_TWO,
    });
    await setDoc(doc(db, 'role_assignments', LEGACY_EMPLOYEE.email), {
      email: LEGACY_EMPLOYEE.email, role: 'employee', orgId: 'default',
    });
    await setDoc(doc(db, 'role_assignments', TWO_HR.email), {
      email: TWO_HR.email, role: 'hr', orgId: ORG_TWO,
    });
  });
}

/**
 * Registers before/after hooks that stand a database up under one ruleset in
 * one migration state. Returns an accessor, because the environment cannot
 * exist until `before` runs.
 *
 * One environment at a time, torn down between scenarios: the emulator holds
 * one ruleset per project and `firebase.json` sets `singleProjectMode`, so two
 * rulesets cannot be live at once.
 */
function scenario(rules, identityStamped) {
  let env;
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host: HOST, port: PORT, rules },
    });
    await seedProductionShape(env, identityStamped);
  });
  after(async () => {
    await env?.cleanup();
    env = undefined;
  });
  return () => env;
}

// ---------------------------------------------------------------------------
// 1. Today. The accounts work, un-backfilled.
// ---------------------------------------------------------------------------

describe('deploy rehearsal — under the deployed ruleset, un-backfilled accounts work', () => {
  const env = scenario(DEPLOYED, false);

  for (const name of EVERYDAY) {
    it(`legacy HR reads ${name}`, async () => {
      await assertSucceeds(getDoc(doc(as(env(), LEGACY_HR), name, 'stamped-doc')));
    });

    it(`legacy HR lists their own organisation's ${name}`, async () => {
      await assertSucceeds(getDocs(query(
        collection(as(env(), LEGACY_HR), name), where('orgId', '==', 'default'),
      )));
    });
  }

  it('a legacy employee reads their own organisation\'s configuration', async () => {
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_EMPLOYEE), 'org_settings', 'default__leavePolicies')));
  });

  it('legacy HR lists the account directory of their own organisation', async () => {
    await assertSucceeds(getDocs(query(
      collection(as(env(), LEGACY_HR), 'users'), where('orgId', '==', 'default'),
    )));
  });
});

// ---------------------------------------------------------------------------
// 2. The lockout. Same accounts, same data, the pending ruleset.
// ---------------------------------------------------------------------------

describe('deploy rehearsal — deploying before the identity backfill locks the legacy organisation out', () => {
  const env = scenario(PENDING, false);

  // This is G7 working as designed, not a defect: an account with no orgId is
  // a stranger, and strangers read nothing. The hazard is entirely one of
  // ordering — these are real accounts, and nothing tells them apart from a
  // stranger except the stamp the backfill writes.
  for (const name of EVERYDAY) {
    it(`legacy HR can no longer read ${name}`, async () => {
      await assertFails(getDoc(doc(as(env(), LEGACY_HR), name, 'stamped-doc')));
    });

    it(`legacy HR can no longer list ${name}`, async () => {
      await assertFails(getDocs(query(
        collection(as(env(), LEGACY_HR), name), where('orgId', '==', 'default'),
      )));
    });

    it(`a legacy employee can no longer read ${name}`, async () => {
      await assertFails(getDoc(doc(as(env(), LEGACY_EMPLOYEE), name, 'stamped-doc')));
    });
  }

  it('legacy HR can no longer read their organisation\'s configuration', async () => {
    await assertFails(getDoc(doc(as(env(), LEGACY_HR), 'org_settings', 'default__leavePolicies')));
  });

  it('legacy HR can no longer list the account directory', async () => {
    await assertFails(getDocs(query(
      collection(as(env(), LEGACY_HR), 'users'), where('orgId', '==', 'default'),
    )));
  });

  it('but they can still sign in — their own profile still reads', async () => {
    // The one thing that must survive, or the lockout is unrecoverable from
    // the client and the backfill cannot be run by anyone who is not a super
    // admin already signed in.
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_HR), 'users', LEGACY_HR.uid)));
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_EMPLOYEE), 'users', LEGACY_EMPLOYEE.uid)));
  });

  it('and they cannot unstick themselves by claiming an organisation', async () => {
    await assertFails(setDoc(doc(as(env(), LEGACY_HR), 'users', LEGACY_HR.uid), {
      uid: LEGACY_HR.uid, email: LEGACY_HR.email, role: 'hr', orgId: 'default',
    }));
  });

  it('the second organisation is unaffected — it was already stamped', async () => {
    await assertSucceeds(getDoc(doc(as(env(), TWO_HR), 'employees', 'two-doc')));
    await assertSucceeds(getDocs(query(
      collection(as(env(), TWO_HR), 'employees'), where('orgId', '==', ORG_TWO),
    )));
  });

  it('a super admin can still reach everything, so the backfill is runnable', async () => {
    await assertSucceeds(getDocs(collection(as(env(), SUPER), 'employees')));
    await assertSucceeds(getDocs(collection(as(env(), SUPER), 'users')));
  });
});

// ---------------------------------------------------------------------------
// 3. After the backfill. The same deploy, done in the right order.
// ---------------------------------------------------------------------------

describe('deploy rehearsal — with the identity backfill run first, the deploy is a no-op for the legacy organisation', () => {
  const env = scenario(PENDING, true);

  for (const name of EVERYDAY) {
    it(`legacy HR reads ${name} again`, async () => {
      await assertSucceeds(getDoc(doc(as(env(), LEGACY_HR), name, 'stamped-doc')));
    });

    it(`legacy HR lists ${name} again`, async () => {
      await assertSucceeds(getDocs(query(
        collection(as(env(), LEGACY_HR), name), where('orgId', '==', 'default'),
      )));
    });
  }

  it('a legacy employee reads the organisation\'s configuration again', async () => {
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_EMPLOYEE), 'org_settings', 'default__leavePolicies')));
  });

  it('legacy HR lists the account directory again', async () => {
    await assertSucceeds(getDocs(query(
      collection(as(env(), LEGACY_HR), 'users'), where('orgId', '==', 'default'),
    )));
  });

  it('an unstamped legacy document is still readable by its own tenant', async () => {
    // The data backfill and the identity backfill are separate repairs. A
    // document that missed the first one is still permitted — `orgKeyOf` reads
    // an absent orgId as 'default' — it is only invisible to the org-filtered
    // query, which is why both backfills are on the runbook.
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_HR), 'employees', 'legacy-doc')));
  });

  it('and the legacy organisation still cannot reach the second one', async () => {
    await assertFails(getDoc(doc(as(env(), LEGACY_HR), 'employees', 'two-doc')));
    await assertFails(getDoc(doc(as(env(), LEGACY_HR), 'org_settings', `${ORG_TWO}__leavePolicies`)));
  });
});

// ---------------------------------------------------------------------------
// 4. What else the deploy changes, besides the lockout
// ---------------------------------------------------------------------------

describe('deploy rehearsal — the access this deploy removes, under the deployed ruleset', () => {
  const env = scenario(DEPLOYED, true);

  it('any organisation\'s HR can list every organisation\'s employee links', async () => {
    // The cross-tenant read of the access-mapping plane. Recorded here as it
    // stands in production today, so the fix below is a measured change rather
    // than an assertion about a hypothetical.
    await assertSucceeds(getDocs(collection(as(env(), TWO_HR), 'employee_links')));
  });

  it('any organisation\'s HR can list every organisation\'s role assignments', async () => {
    await assertSucceeds(getDocs(collection(as(env(), TWO_HR), 'role_assignments')));
  });

  it('an administrator can create an account belonging to no organisation', async () => {
    await assertSucceeds(setDoc(doc(as(env(), SUPER), 'users', 'uid-unstamped'), {
      uid: 'uid-unstamped', email: 'nobody@example.test', role: 'employee', superAdmin: false,
    }));
  });
});

describe('deploy rehearsal — the same three, under the pending ruleset', () => {
  const env = scenario(PENDING, true);

  it('HR can no longer list another organisation\'s employee links', async () => {
    await assertFails(getDocs(collection(as(env(), TWO_HR), 'employee_links')));
  });

  it('HR can no longer list another organisation\'s role assignments', async () => {
    await assertFails(getDocs(collection(as(env(), TWO_HR), 'role_assignments')));
  });

  it('an account can no longer be created belonging to no organisation', async () => {
    await assertFails(setDoc(doc(as(env(), SUPER), 'users', 'uid-unstamped'), {
      uid: 'uid-unstamped', email: 'nobody@example.test', role: 'employee', superAdmin: false,
    }));
  });

  it('HR still lists their own organisation\'s links and assignments', async () => {
    // The tightening must not cost an organisation the mappings it owns —
    // that would break the access-mapping backfill for everyone, not just
    // across tenants.
    await assertSucceeds(getDocs(query(
      collection(as(env(), TWO_HR), 'employee_links'), where('orgId', '==', ORG_TWO),
    )));
    await assertSucceeds(getDocs(query(
      collection(as(env(), TWO_HR), 'role_assignments'), where('orgId', '==', ORG_TWO),
    )));
  });

  it('an employee still reads their own link and assignment, which sign-in needs', async () => {
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_EMPLOYEE), 'employee_links', LEGACY_EMPLOYEE.uid)));
    await assertSucceeds(getDoc(doc(as(env(), LEGACY_EMPLOYEE), 'role_assignments', LEGACY_EMPLOYEE.email)));
  });

  it('a super admin still lists them unfiltered, which the backfill needs', async () => {
    await assertSucceeds(getDocs(collection(as(env(), SUPER), 'employee_links')));
    await assertSucceeds(getDocs(collection(as(env(), SUPER), 'role_assignments')));
  });
});
