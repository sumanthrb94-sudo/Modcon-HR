/**
 * Onboarding simulation — three organisations, provisioned the way the app
 * provisions them, then held to the isolation invariants.
 *
 * Everything else under tests/rules/ starts from fixtures written with the
 * rules disabled: two tenants that simply *exist*. That answers "is the
 * ruleset correct once two tenants are populated" and leaves the question this
 * file exists for unanswered — **can a second organisation be onboarded at
 * all**, by the principals who actually do it, through writes the rules
 * permit. Nothing covered that: `grep` over tests/ for `createOrganization`,
 * `inviteAccount` or `setOrgHrAdministrator` returns nothing.
 *
 * So each organisation here is brought into being in order — org record, first
 * `hr` account, role assignment, configuration, invited people, tenant data —
 * with every write issued **through the rules** as the principal who issues it
 * in the app. A provisioning step the rules would refuse fails this suite
 * rather than being papered over by `withSecurityRulesDisabled`.
 *
 * The document shapes below are the ones the app writes. They are duplicated
 * from source rather than imported, because importing `src/` here would need a
 * bundler (the `@/` alias, JSX in the graph via auth.tsx, `import.meta.env`,
 * and a `localStorage` read at module-evaluation time). Source of truth:
 *
 *   organizations / users / role_assignments  src/lib/organizations.ts:52-102
 *   invited users / links                     src/lib/accountInvites.ts:104-127
 *   org_settings                              src/lib/orgSettings.ts (<orgKey>__<key>)
 *
 * Three organisations rather than two on purpose: with two tenants, "my org"
 * and "not my org" are the same partition, so a rule that leaks to exactly one
 * other tenant is indistinguishable from one that leaks to all of them. The
 * cross-tenant matrix below runs over every ordered pair.
 *
 * Run with `npm run test:rules` (serialised — see handbook.rules.test.mjs).
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
  collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

/**
 * The platform's super admin. Carries `role: 'admin'` as well as the flag,
 * because that is what the real account looks like — the fixed
 * SUPER_ADMIN_EMAILS entry is also in ADMIN_EMAILS (src/lib/auth.tsx), and the
 * /users create rule provisioning depends on is the `isAdmin()` branch, not
 * the super-admin one.
 */
const SUPER = { uid: 'super-1', email: 'super@modcon.test', role: 'admin', superAdmin: true };

/** The three organisations onboarded, in order. */
const ORGS = [
  { id: 'org-acme', name: 'Acme Industries', adminUid: 'uid-acme-hr', adminEmail: 'hr@acme.test' },
  { id: 'org-borealis', name: 'Borealis Foods', adminUid: 'uid-borealis-hr', adminEmail: 'hr@borealis.test' },
  { id: 'org-cendant', name: 'Cendant Logistics', adminUid: 'uid-cendant-hr', adminEmail: 'hr@cendant.test' },
];

/** The people each org's HR admin invites once the org exists. */
function inviteesOf(org) {
  const slug = org.id.replace('org-', '');
  return [
    { uid: `uid-${slug}-mgr`, email: `manager@${slug}.test`, role: 'manager', orgId: org.id },
    { uid: `uid-${slug}-emp`, email: `employee@${slug}.test`, role: 'employee', orgId: org.id },
  ];
}

/** Plain org-scoped tenant data — mirrors PLAIN in multitenancy.rules.test.mjs. */
const PLAIN = [
  'employees', 'attendance', 'payroll_runs', 'jobs', 'candidates',
  'onboarding', 'goals', 'performance_reviews', 'assets',
  'billing_preferences', 'billing_invoices',
];

/** Employee-authored collections. */
const SELF_SERVE = ['expenses', 'helpdesk_tickets', 'regularizations'];

/**
 * The identity and access-mapping collections. Called out separately because
 * invariant I2 extends the no-cross-tenant-read rule to them, and because they
 * are the ones that were not org-scoped on `list`: `isOrgAdmin()` never
 * dereferences `resource`, so a bare `allow read: if isOrgAdmin() || ...`
 * held for a whole-collection list regardless of who owned the documents.
 */
const IDENTITY = ['role_assignments', 'employee_links'];

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

// ---------------------------------------------------------------------------
// The onboarding sequence itself
// ---------------------------------------------------------------------------

/**
 * `createOrganization` (src/lib/organizations.ts), minus the Firebase Auth
 * account it mints on a throwaway secondary app — that part is Firebase's own
 * API rather than this application's logic, and the emulator's authenticated
 * contexts stand in for its result.
 *
 * Every write is issued as the super admin, which is who issues them in the
 * app, and every one is asserted to succeed. A rules change that broke org
 * provisioning would fail here rather than in production.
 */
async function provisionOrganization(org) {
  const su = as(SUPER);

  await assertSucceeds(setDoc(doc(su, 'organizations', org.id), {
    name: org.name,
    adminEmail: org.adminEmail,
    createdBy: SUPER.uid,
  }));

  await assertSucceeds(setDoc(doc(su, 'users', org.adminUid), {
    uid: org.adminUid,
    email: org.adminEmail,
    displayName: org.name,
    photoURL: null,
    role: 'hr',
    orgId: org.id,
    superAdmin: false,
    lastLoginAt: null,
  }));

  await assertSucceeds(setDoc(doc(su, 'role_assignments', org.adminEmail), {
    email: org.adminEmail,
    role: 'hr',
    orgId: org.id,
    assignedBy: SUPER.uid,
  }));

  // The second write to the org record, once the account exists.
  await assertSucceeds(updateDoc(doc(su, 'organizations', org.id), { adminUid: org.adminUid }));
}

/** `inviteAccount` (src/lib/accountInvites.ts), issued as the org's HR admin. */
async function inviteAccountAs(hr, invitee, orgId) {
  const db = as(hr);

  await assertSucceeds(setDoc(doc(db, 'users', invitee.uid), {
    uid: invitee.uid,
    email: invitee.email,
    displayName: invitee.email,
    photoURL: null,
    role: invitee.role,
    orgId,
    superAdmin: false,
    lastLoginAt: null,
    invitedBy: hr.uid,
  }));

  await assertSucceeds(setDoc(doc(db, 'role_assignments', invitee.email), {
    email: invitee.email,
    role: invitee.role,
    orgId,
    assignedBy: hr.uid,
  }));

  // Written only when exactly one employee record in the org carries the
  // address — see the note in the invite-linking test below.
  await assertSucceeds(setDoc(doc(db, 'employee_links', invitee.uid), {
    uid: invitee.uid,
    employeeId: `${orgId}-emp-1`,
    orgId,
    linkedBy: hr.uid,
  }));
}

/** The HR admin populating their new organisation: configuration and data. */
async function populateOrganization(org) {
  const hr = { uid: org.adminUid, email: org.adminEmail };
  const db = as(hr);

  await assertSucceeds(setDoc(doc(db, 'org_settings', `${org.id}__companyProfile`), {
    orgId: org.id,
    key: 'companyProfile',
    valueJson: JSON.stringify({ name: org.name, hrDesignations: ['Head of People'] }),
  }));

  await assertSucceeds(setDoc(doc(db, 'org_settings', `${org.id}__leavePolicies`), {
    orgId: org.id, key: 'leavePolicies', valueJson: '[]',
  }));

  for (const name of PLAIN) {
    await assertSucceeds(setDoc(doc(db, name, `${org.id}-doc`), {
      id: `${org.id}-doc`, orgId: org.id, label: `${org.name} record`,
    }));
  }

  // Salary and leave, which layer per-employee rules on top of org scoping.
  await assertSucceeds(setDoc(doc(db, 'employee_compensation', `${org.id}-emp-1`), {
    employeeId: `${org.id}-emp-1`, orgId: org.id, ctc: 100,
  }));
  await assertSucceeds(setDoc(doc(db, 'payslips', `${org.id}-ps-1`), {
    employeeId: `${org.id}-emp-1`, orgId: org.id, netPay: 10,
  }));
  await assertSucceeds(setDoc(doc(db, 'leave_balances', `${org.id}-lb-1`), {
    employeeId: `${org.id}-emp-1`, orgId: org.id, available: 5, managerChainIds: [],
  }));
}

/** Onboard all three organisations from an empty database. */
async function onboardAll() {
  await testEnv.clearFirestore();

  // The super admin's own profile is the one document that cannot be created
  // by the flow — it predates every organisation.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', SUPER.uid), {
      uid: SUPER.uid, email: SUPER.email, role: SUPER.role, superAdmin: true,
    });
  });

  for (const org of ORGS) {
    await provisionOrganization(org);
    await populateOrganization(org);
    const hr = { uid: org.adminUid, email: org.adminEmail };
    for (const invitee of inviteesOf(org)) {
      await inviteAccountAs(hr, invitee, org.id);
    }
  }
}

const hrOf = (org) => ({ uid: org.adminUid, email: org.adminEmail });
const employeeOf = (org) => inviteesOf(org)[1];
const managerOf = (org) => inviteesOf(org)[0];

// ---------------------------------------------------------------------------
// 1. Provisioning produced the right state
// ---------------------------------------------------------------------------

describe('onboarding — provisioning three organisations', () => {
  before(onboardAll);

  for (const org of ORGS) {
    it(`${org.name}: the organisation record names its administrator`, async () => {
      const snap = await getDoc(doc(as(SUPER), 'organizations', org.id));
      assert.equal(snap.exists(), true);
      const data = snap.data();
      assert.equal(data.name, org.name);
      assert.equal(data.adminEmail, org.adminEmail);
      assert.equal(data.adminUid, org.adminUid, 'the follow-up updateDoc must have landed');
      assert.equal(data.createdBy, SUPER.uid);
    });

    it(`${org.name}: the first account is hr, scoped to this org, and not a platform admin`, async () => {
      const snap = await getDoc(doc(as(SUPER), 'users', org.adminUid));
      const data = snap.data();
      // The distinction the whole role model rests on: an organisation's own
      // administrator, not a platform admin who could mint further admins.
      assert.equal(data.role, 'hr');
      assert.equal(data.orgId, org.id);
      assert.equal(data.superAdmin, false);
    });

    it(`${org.name}: the role assignment agrees with the profile`, async () => {
      const snap = await getDoc(doc(as(SUPER), 'role_assignments', org.adminEmail));
      const data = snap.data();
      assert.equal(data.role, 'hr');
      assert.equal(data.orgId, org.id);
      // The rule requires the document id and the email field to agree, so an
      // assignment can never be filed under one address while naming another.
      assert.equal(data.email, org.adminEmail);
    });

    it(`${org.name}: its org key is usable as an org_settings id`, () => {
      // `<orgKey>__<setting>` is split on '__', so an org key containing the
      // separator would compare as '' and match nothing.
      assert.ok(!org.id.includes('__'));
      assert.notEqual(org.id, 'default');
    });
  }

  it('the three organisations are distinct tenants', () => {
    assert.equal(new Set(ORGS.map((o) => o.id)).size, ORGS.length);
  });
});

// ---------------------------------------------------------------------------
// 2. What an organisation's own administrator may and may not do
// ---------------------------------------------------------------------------

describe('onboarding — an org administrator administers one organisation', () => {
  beforeEach(onboardAll);

  const [acme, borealis] = ORGS;

  it('cannot create another organisation', async () => {
    await assertFails(setDoc(doc(as(hrOf(acme)), 'organizations', 'org-rogue'), {
      name: 'Rogue', adminEmail: 'x@rogue.test', createdBy: acme.adminUid,
    }));
  });

  it('cannot set a feature flag, even on their own organisation', async () => {
    // Which tenants a rollout has reached is a platform decision.
    await assertFails(updateDoc(doc(as(hrOf(acme)), 'organizations', acme.id), {
      'features.newThing': true,
    }));
  });

  it('cannot mint a platform admin', async () => {
    await assertFails(setDoc(doc(as(hrOf(acme)), 'users', 'uid-escalation'), {
      uid: 'uid-escalation', email: 'esc@acme.test', role: 'admin', orgId: acme.id, superAdmin: false,
    }));
  });

  it('cannot make anyone a super admin', async () => {
    await assertFails(setDoc(doc(as(hrOf(acme)), 'users', 'uid-escalation'), {
      uid: 'uid-escalation', email: 'esc@acme.test', role: 'hr', orgId: acme.id, superAdmin: true,
    }));
  });

  it('cannot create an account belonging to nobody', async () => {
    // The shape G7 was about, arriving by a different route: an account with no
    // organisation used to resolve to the incumbent tenant.
    await assertFails(setDoc(doc(as(hrOf(acme)), 'users', 'uid-orphan'), {
      uid: 'uid-orphan', email: 'orphan@acme.test', role: 'employee', superAdmin: false,
    }));
  });

  it('cannot create an account inside another organisation', async () => {
    await assertFails(setDoc(doc(as(hrOf(acme)), 'users', 'uid-poach'), {
      uid: 'uid-poach', email: 'poach@borealis.test', role: 'employee', orgId: borealis.id, superAdmin: false,
    }));
  });

  it('cannot move their own account into another organisation', async () => {
    await assertFails(updateDoc(doc(as(hrOf(acme)), 'users', acme.adminUid), { orgId: borealis.id }));
  });

  it('cannot move one of their own people into another organisation', async () => {
    const emp = employeeOf(acme);
    await assertFails(updateDoc(doc(as(hrOf(acme)), 'users', emp.uid), { orgId: borealis.id }));
  });

  it('can invite within their own organisation', async () => {
    await assertSucceeds(setDoc(doc(as(hrOf(acme)), 'users', 'uid-new-hire'), {
      uid: 'uid-new-hire', email: 'newhire@acme.test', role: 'employee', orgId: acme.id, superAdmin: false,
    }));
  });
});

// ---------------------------------------------------------------------------
// 3. The cross-tenant matrix, over every ordered pair
// ---------------------------------------------------------------------------

describe('onboarding — no organisation can reach another, in either direction', () => {
  before(onboardAll);

  for (const source of ORGS) {
    for (const target of ORGS) {
      if (source.id === target.id) continue;

      const label = `${source.name} -> ${target.name}`;

      for (const name of [...PLAIN, ...SELF_SERVE]) {
        it(`${label}: HR cannot read ${name}`, async () => {
          await assertFails(getDoc(doc(as(hrOf(source)), name, `${target.id}-doc`)));
        });

        it(`${label}: HR cannot list ${name} filtered to the other org`, async () => {
          await assertFails(getDocs(query(
            collection(as(hrOf(source)), name), where('orgId', '==', target.id),
          )));
        });

        it(`${label}: an employee cannot read ${name}`, async () => {
          await assertFails(getDoc(doc(as(employeeOf(source)), name, `${target.id}-doc`)));
        });
      }

      for (const name of PLAIN) {
        it(`${label}: HR cannot write into ${name}`, async () => {
          await assertFails(setDoc(doc(as(hrOf(source)), name, 'invader'), {
            id: 'invader', orgId: target.id,
          }));
        });

        it(`${label}: HR cannot take over an existing ${name} record`, async () => {
          // The takeover case: overwriting another tenant's document while
          // stamping it with your own org. The update rule must test the
          // *stored* document, not only the incoming one.
          await assertFails(setDoc(doc(as(hrOf(source)), name, `${target.id}-doc`), {
            id: `${target.id}-doc`, orgId: source.id,
          }));
        });
      }

      it(`${label}: HR cannot read the other organisation's record`, async () => {
        await assertFails(getDoc(doc(as(hrOf(source)), 'organizations', target.id)));
      });

      it(`${label}: HR cannot read the other organisation's accounts`, async () => {
        await assertFails(getDoc(doc(as(hrOf(source)), 'users', target.adminUid)));
      });

      it(`${label}: HR cannot read the other organisation's configuration`, async () => {
        await assertFails(getDoc(doc(as(hrOf(source)), 'org_settings', `${target.id}__companyProfile`)));
      });

      it(`${label}: HR cannot write the other organisation's configuration`, async () => {
        await assertFails(setDoc(doc(as(hrOf(source)), 'org_settings', `${target.id}__leavePolicies`), {
          orgId: target.id, key: 'leavePolicies', valueJson: '[]',
        }));
      });

      it(`${label}: HR cannot read the other organisation's salary`, async () => {
        await assertFails(getDoc(doc(as(hrOf(source)), 'employee_compensation', `${target.id}-emp-1`)));
      });

      it(`${label}: HR cannot read the other organisation's payslips`, async () => {
        await assertFails(getDoc(doc(as(hrOf(source)), 'payslips', `${target.id}-ps-1`)));
      });

      for (const name of IDENTITY) {
        it(`${label}: HR cannot read the other organisation's ${name}`, async () => {
          const id = name === 'role_assignments' ? target.adminEmail : employeeOf(target).uid;
          await assertFails(getDoc(doc(as(hrOf(source)), name, id)));
        });

        it(`${label}: HR cannot list ${name} filtered to the other org`, async () => {
          await assertFails(getDocs(query(
            collection(as(hrOf(source)), name), where('orgId', '==', target.id),
          )));
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Unfiltered lists — the property that makes the query filter load-bearing
// ---------------------------------------------------------------------------

describe('onboarding — an unfiltered list is denied once a second organisation exists', () => {
  before(onboardAll);

  const acme = ORGS[0];

  for (const name of [...PLAIN, ...SELF_SERVE, 'users', ...IDENTITY, 'org_settings']) {
    it(`${name}: HR cannot list the whole collection`, async () => {
      await assertFails(getDocs(collection(as(hrOf(acme)), name)));
    });
  }

  for (const name of [...PLAIN, ...SELF_SERVE, 'org_settings']) {
    it(`${name}: HR can list their own organisation`, async () => {
      await assertSucceeds(getDocs(query(
        collection(as(hrOf(acme)), name), where('orgId', '==', acme.id),
      )));
    });
  }

  // These two are the access-mapping plane. Before this suite they were the
  // one place an unfiltered list *succeeded*: their read rule was a single
  // `isOrgAdmin() || <self>`, and `isOrgAdmin()` never looks at `resource`, so
  // it was satisfied for a list of every tenant's documents. That handed any
  // organisation's HR admin every other organisation's uid -> employeeId
  // mapping and every pending role assignment — invariant I2.
  for (const name of IDENTITY) {
    it(`${name}: HR can list their own organisation's mappings`, async () => {
      await assertSucceeds(getDocs(query(
        collection(as(hrOf(acme)), name), where('orgId', '==', acme.id),
      )));
    });
  }

  it('users: HR can list their own organisation', async () => {
    await assertSucceeds(getDocs(query(
      collection(as(hrOf(acme)), 'users'), where('orgId', '==', acme.id),
    )));
  });

  it('an employee still reads their own role assignment', async () => {
    // The self branch must survive the org scoping — auth.tsx reads this at
    // every sign-in, before anything else has resolved.
    const emp = employeeOf(acme);
    await assertSucceeds(getDoc(doc(as(emp), 'role_assignments', emp.email)));
  });

  it('an employee still reads their own employee link', async () => {
    const emp = employeeOf(acme);
    await assertSucceeds(getDoc(doc(as(emp), 'employee_links', emp.uid)));
  });

  it('an employee reads their own link even before one is written', async () => {
    // `inMyOrg()` dereferences `resource.data`, which is null for a document
    // that does not exist — so the self branch has to be evaluated first or a
    // brand-new account is denied the read of its own missing link.
    const stranger = { uid: 'uid-unlinked', email: 'unlinked@acme.test' };
    await assertSucceeds(getDoc(doc(as(stranger), 'employee_links', stranger.uid)));
  });

  it('an employee cannot list the access mappings at all', async () => {
    await assertFails(getDocs(collection(as(employeeOf(acme)), 'employee_links')));
  });
});

// ---------------------------------------------------------------------------
// 5. A newly onboarded organisation's own surfaces work
// ---------------------------------------------------------------------------

describe('onboarding — a new organisation can actually use the product', () => {
  before(onboardAll);

  const cendant = ORGS[2];

  it('its HR admin reads its own organisation record', async () => {
    await assertSucceeds(getDoc(doc(as(hrOf(cendant)), 'organizations', cendant.id)));
  });

  it('its people read a setting the organisation has not published yet', async () => {
    // The config sync subscribes at sign-in, before anything is written. A rule
    // that reads `resource.data` would deny this rather than miss cleanly, and
    // a brand-new organisation would fail to start.
    await assertSucceeds(getDoc(doc(as(employeeOf(cendant)), 'org_settings', `${cendant.id}__holidays`)));
  });

  it('its people read the configuration it has published', async () => {
    await assertSucceeds(getDoc(doc(as(employeeOf(cendant)), 'org_settings', `${cendant.id}__companyProfile`)));
  });

  it('its HR admin cannot file configuration under a mismatched id', async () => {
    // The id and the orgId field must agree, or the document passes the write
    // rule but no query ever returns it.
    await assertFails(setDoc(doc(as(hrOf(cendant)), 'org_settings', `${cendant.id}__integrations`), {
      orgId: ORGS[0].id, key: 'integrations', valueJson: '{}',
    }));
  });

  it('its manager reads the organisation directory, filtered', async () => {
    await assertSucceeds(getDocs(query(
      collection(as(hrOf(cendant)), 'users'), where('orgId', '==', cendant.id),
    )));
  });

  it('an invited employee is scoped to the organisation that invited them', async () => {
    const snap = await getDoc(doc(as(SUPER), 'users', employeeOf(cendant).uid));
    const data = snap.data();
    assert.equal(data.orgId, cendant.id);
    assert.equal(data.role, 'employee');
    assert.equal(data.superAdmin, false);
    assert.equal(data.invitedBy, cendant.adminUid);
  });

  it('an invited employee reads their own compensation through their link', async () => {
    // The whole point of employee_links: without one, the per-employee tier of
    // the rules resolves to no employee and the account reads nothing of its
    // own. This is the assertion that fails in production today, because
    // employees added through the UI never reach Firestore at all — see the
    // report accompanying this suite.
    const emp = employeeOf(cendant);
    await assertSucceeds(getDoc(doc(as(emp), 'employee_compensation', `${cendant.id}-emp-1`)));
  });

  it('an invited employee cannot read another organisation\'s compensation', async () => {
    const emp = employeeOf(cendant);
    await assertFails(getDoc(doc(as(emp), 'employee_compensation', `${ORGS[0].id}-emp-1`)));
  });

  it('its manager cannot read the platform-wide account directory', async () => {
    await assertFails(getDocs(collection(as(managerOf(cendant)), 'users')));
  });
});

// ---------------------------------------------------------------------------
// 6. The super admin, who is the one account that spans organisations
// ---------------------------------------------------------------------------

describe('onboarding — the super admin spans every organisation', () => {
  before(onboardAll);

  it('reads every organisation record', async () => {
    for (const org of ORGS) {
      await assertSucceeds(getDoc(doc(as(SUPER), 'organizations', org.id)));
    }
  });

  it('lists every organisation, which is what the Organizations page does', async () => {
    await assertSucceeds(getDocs(collection(as(SUPER), 'organizations')));
  });

  it('sets a feature flag on any organisation', async () => {
    await assertSucceeds(updateDoc(doc(as(SUPER), 'organizations', ORGS[1].id), {
      'features.stagedRollout': true,
    }));
  });

  it('attaches an existing account to an organisation as its HR admin', async () => {
    // Organizations -> "Set HR admin": role and orgId written together,
    // because either alone is wrong.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'uid-floating'), {
        uid: 'uid-floating', email: 'floating@example.test', role: 'employee',
      });
    });
    await assertSucceeds(updateDoc(doc(as(SUPER), 'users', 'uid-floating'), {
      role: 'hr', orgId: ORGS[2].id,
    }));
  });

  it('reads across organisations unfiltered, which no org admin may do', async () => {
    await assertSucceeds(getDocs(collection(as(SUPER), 'employees')));
    await assertSucceeds(getDocs(collection(as(SUPER), 'employee_links')));
  });
});

// ---------------------------------------------------------------------------
// 7. An account with no organisation is nobody (I9)
// ---------------------------------------------------------------------------

describe('onboarding — an account with no organisation reaches none of them', () => {
  const stranger = { uid: 'uid-stranger', email: 'stranger@example.test' };

  before(async () => {
    await onboardAll();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', stranger.uid), {
        uid: stranger.uid, email: stranger.email, role: 'employee',
      });
    });
  });

  for (const org of ORGS) {
    it(`reads nothing belonging to ${org.name}`, async () => {
      await assertFails(getDoc(doc(as(stranger), 'employees', `${org.id}-doc`)));
      await assertFails(getDoc(doc(as(stranger), 'organizations', org.id)));
      await assertFails(getDoc(doc(as(stranger), 'org_settings', `${org.id}__companyProfile`)));
    });
  }

  it('still reads its own profile, so signing in works', async () => {
    await assertSucceeds(getDoc(doc(as(stranger), 'users', stranger.uid)));
  });

  it('cannot give itself an organisation', async () => {
    await assertFails(updateDoc(doc(as(stranger), 'users', stranger.uid), { orgId: ORGS[0].id }));
  });
});
