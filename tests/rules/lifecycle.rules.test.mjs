/**
 * Four months of operational life, in two tenants at once.
 *
 * ## Why this suite exists
 *
 * The other rules suites assert a boundary at rest: given this fixture, is this
 * read allowed. That catches a rule that is wrong on the day it is written. It
 * does not catch the boundary that only opens *after* something else happens —
 * a hire linked in April who is still reading payslips in July after being
 * offboarded, a role granted in May that nothing revokes in June, an
 * organisation whose data becomes reachable only once the other organisation
 * has grown a record with the same id.
 *
 * So this one runs a **simulation**: two organisations, four monthly cycles,
 * each cycle onboarding a hire, generating that month's attendance, leave,
 * expense and payroll, and probing the tenant boundary from both sides while
 * the data accumulates. State carries forward across the `it()` blocks on
 * purpose — the fixture at the end of month four is four months of history,
 * not a fresh seed. That is the whole point, and it is why this file seeds once
 * in `before()` rather than in `beforeEach()` the way its neighbours do.
 *
 * ## What it is not
 *
 * It is not an app test. It drives Firestore directly against `firestore.rules`
 * in the emulator, so it says nothing about what the UI offers. The value is
 * that it can run on every iteration for free — the E2E suite signs in against
 * *live* Firebase, so a four-month simulation there would burn real quota and
 * leave real accounts behind on every run.
 *
 * Run with `npm run test:rules`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modcon-hr';
const HOST = '127.0.0.1';
const PORT = 8080;

/**
 * The four months the simulation walks.
 *
 * Hardcoded rather than derived from the clock: these are fixture dates, and a
 * fixture is allowed a literal. `src/lib/today.ts` owns the app's notion of
 * "now" and nothing here is asserting against it — a suite whose fixtures moved
 * with the calendar would pass or fail depending on the day it ran.
 */
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07'];

/**
 * Two tenants, each with its own HR administrator and one manager.
 *
 * `org-north` and `org-south` rather than `org-a`/`org-b`: the neighbouring
 * suites use those ids, and a copied assertion that still passes because it is
 * silently reading the other file's fixture is the failure mode this naming
 * avoids.
 */
const TENANTS = ['north', 'south'];

const org = (t) => `org-${t}`;
const hrOf = (t) => ({ uid: `hr-${t}`, email: `hr@${t}.example`, role: 'hr', orgId: org(t) });
const mgrOf = (t) => ({ uid: `mgr-${t}`, email: `mgr@${t}.example`, role: 'manager', orgId: org(t) });
/** The manager's own employee record — what `managerChainIds` points at. */
const mgrEmp = (t) => `emp-${t}-mgr`;

/** A hire made in month `m` (0-based) of tenant `t`. */
function hire(t, m) {
  return {
    uid: `${t}-hire-${m}`,
    email: `hire${m}@${t}.example`,
    employeeId: `emp-${t}-${m}`,
    orgId: org(t),
    role: 'employee',
  };
}

/** A self-registered account: no orgId, nobody's colleague, no employee record. */
const STRANGER = { uid: 'stranger', email: 'stranger@nowhere.example' };

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

/** The other tenant — the one every cross-boundary probe below comes from. */
const otherThan = (t) => TENANTS.find((x) => x !== t);

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules: readFileSync('firestore.rules', 'utf8') },
  });

  // Seeded once, with security rules off, because these are the accounts that
  // must already exist for anyone to act at all: each organisation's first HR
  // administrator (provisioned by a super admin in src/lib/organizations.ts)
  // and its manager. Everything after this point is written *through* the
  // rules by one of them, which is what makes the simulation meaningful.
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const t of TENANTS) {
      for (const u of [hrOf(t), mgrOf(t)]) {
        await setDoc(doc(db, 'users', u.uid), {
          uid: u.uid, email: u.email, displayName: u.email, role: u.role, orgId: u.orgId,
        });
      }
      // The manager is an employee too, and is linked — `managesSubject()`
      // resolves the caller to an employeeId before it can match a chain.
      await setDoc(doc(db, 'employees', mgrEmp(t)), {
        id: mgrEmp(t), orgId: org(t), name: `Manager ${t}`, managerChainIds: [],
      });
      await setDoc(doc(db, 'employee_links', mgrOf(t).uid), {
        uid: mgrOf(t).uid, employeeId: mgrEmp(t), orgId: org(t),
      });
      await setDoc(doc(db, 'organizations', org(t)), {
        name: `Org ${t}`, adminEmail: hrOf(t).email, createdBy: 'super',
      });
    }
    // The stranger exists in Auth and has upserted a profile, which is all a
    // self-registration ever produced. No orgId — that is the point.
    await setDoc(doc(db, 'users', STRANGER.uid), {
      uid: STRANGER.uid, email: STRANGER.email, displayName: 'Stranger', role: 'employee',
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

// ---------------------------------------------------------------------------
// The simulation.
//
// One describe per month, in order, sharing accumulated state. Within a month
// every tenant runs the same cycle, and every step is probed from the other
// tenant as well as its own.
// ---------------------------------------------------------------------------

/** Onboard a hire the way `inviteAccount` does: profile, assignment, link. */
async function onboard(t, m) {
  const h = hire(t, m);
  const hr = hrOf(t);

  // 1. The account, stamped with the inviter's organisation at creation.
  await assertSucceeds(setDoc(doc(as(hr), 'users', h.uid), {
    uid: h.uid, email: h.email, displayName: h.email,
    role: h.role, orgId: h.orgId, superAdmin: false, invitedBy: hr.uid,
  }));

  // 2. The durable record of the grant, keyed by email.
  await assertSucceeds(setDoc(doc(as(hr), 'role_assignments', h.email), {
    email: h.email, role: h.role, orgId: h.orgId, assignedBy: hr.uid,
  }));

  // 3. The employee record, and 4. the link that makes "their own payslip" mean
  //    something. Without the link the account resolves to no employee and
  //    reads none of its own salary or leave.
  await assertSucceeds(setDoc(doc(as(hr), 'employees', h.employeeId), {
    id: h.employeeId, orgId: h.orgId, name: `Hire ${m} ${t}`, email: h.email,
    managerChainIds: [mgrEmp(t)],
  }));
  await assertSucceeds(setDoc(doc(as(hr), 'employee_links', h.uid), {
    uid: h.uid, employeeId: h.employeeId, orgId: h.orgId, linkedBy: hr.uid,
  }));

  return h;
}

/** A month of ordinary activity for one hire. */
async function monthOfWork(t, m, h) {
  const hr = hrOf(t);
  const month = MONTHS[m];
  const suffix = `${t}-${m}`;

  // HR posts the month's attendance and payroll.
  await assertSucceeds(setDoc(doc(as(hr), 'attendance', `att-${suffix}`), {
    employeeId: h.employeeId, orgId: h.orgId, month, present: 21,
  }));
  await assertSucceeds(setDoc(doc(as(hr), 'payroll_runs', `run-${suffix}`), {
    orgId: h.orgId, month, status: 'Processed',
  }));
  await assertSucceeds(setDoc(doc(as(hr), 'payslips', `ps-${suffix}`), {
    employeeId: h.employeeId, orgId: h.orgId, month, netPay: 50_000 + m,
  }));
  await assertSucceeds(setDoc(doc(as(hr), 'leave_balances', `lb-${suffix}`), {
    employeeId: h.employeeId, orgId: h.orgId, available: 12 - m,
    managerChainIds: [mgrEmp(t)],
  }));

  // The hire files their own leave and expense — the self-service half.
  await assertSucceeds(setDoc(doc(as(h), 'leave_requests', `lr-${suffix}`), {
    employeeId: h.employeeId, orgId: h.orgId, month, status: 'Pending',
    managerChainIds: [mgrEmp(t)],
  }));
  await assertSucceeds(setDoc(doc(as(h), 'expenses', `exp-${suffix}`), {
    employeeId: h.employeeId, orgId: h.orgId, month, amount: 1200,
    submittedBy: h.uid, status: 'Pending',
  }));
}

for (const [m, month] of MONTHS.entries()) {
  describe(`month ${m + 1} (${month}) — both tenants run a full cycle`, () => {
    const hires = {};

    it('each organisation onboards a hire, stamped with its own org', async () => {
      for (const t of TENANTS) hires[t] = await onboard(t, m);
    });

    it('neither organisation can onboard into the other', async () => {
      for (const t of TENANTS) {
        const intruder = hrOf(otherThan(t));
        const victim = hires[t];
        // A profile in someone else's organisation.
        await assertFails(setDoc(doc(as(intruder), 'users', `poach-${t}-${m}`), {
          uid: `poach-${t}-${m}`, email: `poach${m}@${t}.example`,
          displayName: 'x', role: 'employee', orgId: org(t),
        }));
        // Re-pointing the new joiner's link while stamping it with the
        // *victim's* org. (The variant that stamps the intruder's own org is
        // the confirmed hole — see the hijack describe at the bottom, which
        // runs last precisely because it corrupts the link it exploits.)
        await assertFails(setDoc(doc(as(intruder), 'employee_links', victim.uid), {
          uid: victim.uid, employeeId: mgrEmp(otherThan(t)), orgId: org(t),
        }));
        // An assignment filed against the other tenant's new joiner.
        await assertFails(setDoc(doc(as(intruder), 'role_assignments', victim.email), {
          email: victim.email, role: 'hr', orgId: org(t), assignedBy: intruder.uid,
        }));
      }
    });

    it('an account is never created without an organisation, nor as an admin', async () => {
      for (const t of TENANTS) {
        const hr = hrOf(t);
        const base = {
          uid: `nostamp-${t}-${m}`, email: `nostamp${m}@${t}.example`,
          displayName: 'x', role: 'employee',
        };
        // No orgId at all — the G7 shape. Belongs to nobody, so it is refused.
        await assertFails(setDoc(doc(as(hr), 'users', base.uid), base));
        // An empty stamp is not a stamp.
        await assertFails(setDoc(doc(as(hr), 'users', base.uid), { ...base, orgId: '' }));
        // `admin` and `superAdmin` are never handed out at creation. They are
        // granted afterwards, by an existing admin, on an existing profile.
        await assertFails(setDoc(doc(as(hr), 'users', base.uid), {
          ...base, orgId: org(t), role: 'admin',
        }));
        await assertFails(setDoc(doc(as(hr), 'users', base.uid), {
          ...base, orgId: org(t), superAdmin: true,
        }));
      }
    });

    it('the month generates attendance, payroll, leave and expenses', async () => {
      for (const t of TENANTS) await monthOfWork(t, m, hires[t]);
    });

    it('a hire reads their own payslip, and only their own', async () => {
      for (const t of TENANTS) {
        const h = hires[t];
        const o = otherThan(t);
        await assertSucceeds(getDoc(doc(as(h), 'payslips', `ps-${t}-${m}`)));
        // The other tenant's payslip for the same month, same shape, same
        // vintage — refused because it is not theirs and not their org's.
        await assertFails(getDoc(doc(as(h), 'payslips', `ps-${o}-${m}`)));
        // A colleague's payslip inside their own organisation, when one exists.
        if (m > 0) await assertFails(getDoc(doc(as(h), 'payslips', `ps-${t}-${m - 1}`)));
      }
    });

    it("a manager reads their own reports' leave, not the other tenant's", async () => {
      for (const t of TENANTS) {
        await assertSucceeds(getDoc(doc(as(mgrOf(t)), 'leave_requests', `lr-${t}-${m}`)));
        await assertFails(getDoc(doc(as(mgrOf(t)), 'leave_requests', `lr-${otherThan(t)}-${m}`)));
      }
    });

    it('every month of accumulated history stays inside its own tenant', async () => {
      // Re-probed every month rather than once at the end: a boundary that
      // holds on an empty database and fails on a populated one is exactly the
      // kind this suite is here to find.
      for (const t of TENANTS) {
        const intruder = hires[otherThan(t)];
        for (let past = 0; past <= m; past += 1) {
          await assertFails(getDoc(doc(as(intruder), 'attendance', `att-${t}-${past}`)));
          await assertFails(getDoc(doc(as(intruder), 'payroll_runs', `run-${t}-${past}`)));
          await assertFails(getDoc(doc(as(intruder), 'employees', `emp-${t}-${past}`)));
        }
      }
    });

    it('the unassigned account reads nothing, in either tenant, ever', async () => {
      for (const t of TENANTS) {
        await assertFails(getDoc(doc(as(STRANGER), 'employees', `emp-${t}-${m}`)));
        await assertFails(getDoc(doc(as(STRANGER), 'attendance', `att-${t}-${m}`)));
        await assertFails(getDoc(doc(as(STRANGER), 'payslips', `ps-${t}-${m}`)));
        await assertFails(getDoc(doc(as(STRANGER), 'organizations', org(t))));
      }
      // Nor can it give itself one by rewriting its own profile.
      await assertFails(setDoc(doc(as(STRANGER), 'users', STRANGER.uid), {
        uid: STRANGER.uid, email: STRANGER.email, displayName: 'Stranger',
        role: 'employee', orgId: org('north'),
      }));
    });
  });
}

// ---------------------------------------------------------------------------
// Mid-life: the role change.
//
// Month three's hire is promoted to manager. A grant that is not revocable is
// not a grant, so this covers both directions.
// ---------------------------------------------------------------------------
describe('after four months — a role change', () => {
  const t = 'north';
  const h = hire(t, 2);
  const hr = hrOf(t);

  it('HR promotes a hire to manager, on the profile and in the assignment', async () => {
    await assertSucceeds(setDoc(doc(as(hr), 'users', h.uid), {
      uid: h.uid, email: h.email, displayName: h.email,
      role: 'manager', orgId: h.orgId, superAdmin: false,
    }));
    await assertSucceeds(setDoc(doc(as(hr), 'role_assignments', h.email), {
      email: h.email, role: 'manager', orgId: h.orgId, assignedBy: hr.uid,
    }));
  });

  it('the promotion is real — the new manager can decide leave', async () => {
    // `leave_requests` update takes `isManager()`, so this only passes because
    // the profile above actually says manager.
    await assertSucceeds(setDoc(doc(as(h), 'leave_requests', `lr-${t}-3`), {
      employeeId: hire(t, 3).employeeId, orgId: h.orgId, month: MONTHS[3],
      status: 'Approved', managerChainIds: [mgrEmp(t)],
    }));
  });

  it('the promotion stops at the tenant line — still no reach into the other org', async () => {
    const o = otherThan(t);
    await assertFails(getDoc(doc(as(h), 'leave_requests', `lr-${o}-3`)));
    await assertFails(getDoc(doc(as(h), 'payslips', `ps-${o}-3`)));
  });

  it('HR cannot promote anyone to admin, here or through the assignment', async () => {
    await assertFails(setDoc(doc(as(hr), 'users', h.uid), {
      uid: h.uid, email: h.email, displayName: h.email,
      role: 'admin', orgId: h.orgId, superAdmin: false,
    }));
    await assertFails(setDoc(doc(as(hr), 'role_assignments', h.email), {
      email: h.email, role: 'admin', orgId: h.orgId, assignedBy: hr.uid,
    }));
  });

  it('HR is demoted back to employee, and loses the reach it had', async () => {
    await assertSucceeds(setDoc(doc(as(hr), 'users', h.uid), {
      uid: h.uid, email: h.email, displayName: h.email,
      role: 'employee', orgId: h.orgId, superAdmin: false,
    }));
    // The leave decision it could make one test ago is refused now: the
    // request is someone else's, and `isManager()` no longer holds.
    await assertFails(setDoc(doc(as(h), 'leave_requests', `lr-${t}-1`), {
      employeeId: hire(t, 1).employeeId, orgId: h.orgId, month: MONTHS[1],
      status: 'Approved', managerChainIds: [mgrEmp(t)],
    }));
  });
});

// ---------------------------------------------------------------------------
// End of life: offboarding.
//
// The question this answers is the one a static fixture cannot: does access
// actually stop, for an account that genuinely had it a moment ago.
// ---------------------------------------------------------------------------
describe('after four months — offboarding', () => {
  const t = 'south';
  const h = hire(t, 0);
  const hr = hrOf(t);

  it('the leaver still reads their own payslip on their last day', async () => {
    await assertSucceeds(getDoc(doc(as(h), 'payslips', `ps-${t}-0`)));
  });

  it('HR removes the link, the assignment and the profile', async () => {
    await assertSucceeds(deleteDoc(doc(as(hr), 'employee_links', h.uid)));
    await assertSucceeds(deleteDoc(doc(as(hr), 'role_assignments', h.email)));
    await assertSucceeds(deleteDoc(doc(as(hr), 'users', h.uid)));
  });

  it('salary and leave access is gone with the link', async () => {
    // Still authenticated — Firebase Auth is untouched by removal from the
    // directory, which the admin UI says in as many words. What is gone is the
    // link, so the account resolves to no employee and `isSelf` is false.
    await assertFails(getDoc(doc(as(h), 'payslips', `ps-${t}-0`)));
    await assertFails(getDoc(doc(as(h), 'leave_balances', `lb-${t}-0`)));
  });

  it('the leaver is now a stranger — no profile, so no organisation', async () => {
    await assertFails(getDoc(doc(as(h), 'employees', `emp-${t}-1`)));
    await assertFails(getDoc(doc(as(h), 'attendance', `att-${t}-1`)));
    await assertFails(getDoc(doc(as(h), 'organizations', org(t))));
  });

  it('and cannot sign back in with an organisation of their own choosing', async () => {
    // The re-registration path: the account still exists in Auth, so it can
    // upsert a profile again. It must not be able to name an org while doing so.
    await assertFails(setDoc(doc(as(h), 'users', h.uid), {
      uid: h.uid, email: h.email, displayName: h.email,
      role: 'employee', orgId: org(t),
    }));
    // A profile with no orgId is all it can write, and that reads nothing.
    await assertSucceeds(setDoc(doc(as(h), 'users', h.uid), {
      uid: h.uid, email: h.email, displayName: h.email, role: 'employee',
    }));
    await assertFails(getDoc(doc(as(h), 'payslips', `ps-${t}-0`)));
  });
});

// ---------------------------------------------------------------------------
// Employee self-service on their own records.
//
// `leave_requests`, `expenses` and `regularizations` all used to carry:
//
//     allow update: if ... (resource.data.employeeId == request.auth.uid ||
//                           isManager());
//
// which is the comparison `myEmployeeId()` in firestore.rules calls out as
// never having evaluated true: it compares an employeeId (`emp-009`) to a
// Firebase uid. `isSelf()` was introduced to fix exactly this and was applied
// to `get`/`list` — `update` was missed on all three. So an employee could
// *file* a leave request or an expense claim and then never edit or withdraw
// it, while the comment above the expenses rule said they could.
//
// Now `isSelf(resource.data.employeeId) || isManager()`, matching the get/list
// rules immediately above each one.
// ---------------------------------------------------------------------------
describe('after four months — an employee edits their own pending records', () => {
  const t = 'north';
  const h = hire(t, 3);

  it('the leave request they filed is theirs to withdraw', async () => {
    const existing = await getDoc(doc(as(h), 'leave_requests', `lr-${t}-3`));
    assert.equal(existing.exists(), true, 'the month-4 request should exist');

    await assertSucceeds(setDoc(doc(as(h), 'leave_requests', `lr-${t}-3`), {
      employeeId: h.employeeId, orgId: h.orgId, month: MONTHS[3],
      status: 'Withdrawn', managerChainIds: [mgrEmp(t)],
    }));
  });

  it('the expense claim they filed is theirs to correct', async () => {
    await assertSucceeds(setDoc(doc(as(h), 'expenses', `exp-${t}-3`), {
      employeeId: h.employeeId, orgId: h.orgId, month: MONTHS[3],
      amount: 1350, submittedBy: h.uid, status: 'Pending',
    }));
  });

  it('and a colleague’s record is still not theirs to touch', async () => {
    // The other half of `isSelf`: it has to say no to somebody else's record,
    // or it is just `isSignedIn()` with extra steps. `emp-north-0` belongs to
    // month one's hire, in the same organisation.
    await assertFails(setDoc(doc(as(h), 'leave_requests', `lr-${t}-0`), {
      employeeId: hire(t, 0).employeeId, orgId: h.orgId, month: MONTHS[0],
      status: 'Withdrawn', managerChainIds: [mgrEmp(t)],
    }));
    await assertFails(setDoc(doc(as(h), 'expenses', `exp-${t}-0`), {
      employeeId: hire(t, 0).employeeId, orgId: h.orgId, month: MONTHS[0],
      amount: 9999, submittedBy: h.uid, status: 'Pending',
    }));
  });

  it('an unlinked account is nobody’s self', async () => {
    // `isSelf` resolves through employee_links. Without one, myEmployeeId() is
    // null and the rule must not fall open — this is the same account that has
    // no organisation at all.
    await assertFails(setDoc(doc(as(STRANGER), 'expenses', `exp-${t}-3`), {
      employeeId: h.employeeId, orgId: h.orgId, month: MONTHS[3],
      amount: 1, submittedBy: STRANGER.uid, status: 'Pending',
    }));
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant role assignment — regression.
//
// The same shape as the link hijack below, one collection over, and worse.
// /role_assignments is keyed by an **email address**, and its write rule only
// ever checked that the payload carried the writer's own orgId. So one
// organisation's HR could file an assignment against a person in another,
// stamped with their own org — and `isAdoptableAssignedRole` compared only the
// role value, never the organisation, so that person adopted `hr` the next
// time they signed in.
//
// Their own orgId never moved, which is what made it an escalation rather than
// a mistake: what they became was an administrator of *their own* organisation,
// installed by a stranger in another one. A whole tenant, administered from
// outside, with no action required from anyone inside it beyond signing in.
//
// Closed on both sides — an assignment is adoptable only by an account already
// in the organisation that filed it, and an assignment filed by one
// organisation is not another's to overwrite.
// ---------------------------------------------------------------------------
describe('one tenant’s HR cannot install an administrator in another', () => {
  const victimOrg = 'south';
  const attacker = hrOf(otherThan(victimOrg));
  const victimHr = hrOf(victimOrg);
  /** A fresh account in the victim org, with no assignment of its own yet. */
  const target = {
    uid: `${victimOrg}-target`, email: `target@${victimOrg}.example`, orgId: org(victimOrg),
  };

  it('the victim org creates an ordinary employee account', async () => {
    await assertSucceeds(setDoc(doc(as(victimHr), 'users', target.uid), {
      uid: target.uid, email: target.email, displayName: target.email,
      role: 'employee', orgId: target.orgId, superAdmin: false,
    }));
  });

  it('the other tenant’s HR can file an assignment against that address', async () => {
    // Not preventable at write time: assignments deliberately precede accounts
    // — that is how a new joiner picks up their role on first sign-in — and
    // rules cannot query for an account by email to find out whose it is. The
    // grant is therefore allowed to exist and made inert at adoption instead.
    await assertSucceeds(setDoc(doc(as(attacker), 'role_assignments', target.email), {
      email: target.email, role: 'hr', orgId: org(otherThan(victimOrg)), assignedBy: attacker.uid,
    }));
  });

  it('but it is inert — the account cannot adopt a role granted by another org', async () => {
    await assertFails(setDoc(doc(as(target), 'users', target.uid), {
      uid: target.uid, email: target.email, displayName: target.email,
      role: 'hr', orgId: target.orgId, superAdmin: false,
    }));
  });

  it('the rightful organisation can write over it, and that grant works', async () => {
    // The recovery path, and why the write rule does not also require the
    // stored assignment to be mine: keyed by email and allowed to precede the
    // account, first-writer-owns-it would let a stranger squat the address
    // permanently. Last writer wins, and the rightful org is never locked out.
    await assertSucceeds(setDoc(doc(as(victimHr), 'role_assignments', target.email), {
      email: target.email, role: 'manager', orgId: target.orgId, assignedBy: victimHr.uid,
    }));
    await assertSucceeds(setDoc(doc(as(target), 'users', target.uid), {
      uid: target.uid, email: target.email, displayName: target.email,
      role: 'manager', orgId: target.orgId, superAdmin: false,
    }));
  });

  it('and re-planting it takes the role away again rather than granting one', async () => {
    // The bounded damage that remains: a foreign restamp can blank a pending
    // grant, which the rightful organisation simply writes again. What it can
    // never do is make the role adoptable.
    await assertSucceeds(setDoc(doc(as(attacker), 'role_assignments', target.email), {
      email: target.email, role: 'hr', orgId: org(otherThan(victimOrg)), assignedBy: attacker.uid,
    }));
    await assertFails(setDoc(doc(as(target), 'users', target.uid), {
      uid: target.uid, email: target.email, displayName: target.email,
      role: 'hr', orgId: target.orgId, superAdmin: false,
    }));
    // The role they already hold is unaffected — a self-write may always
    // re-affirm the stored value.
    await assertSucceeds(setDoc(doc(as(target), 'users', target.uid), {
      uid: target.uid, email: target.email, displayName: target.email,
      role: 'manager', orgId: target.orgId, superAdmin: false,
    }));
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant employee_link hijack — regression.
//
// `match /employee_links/{uid}` used to guard its write with only:
//
//     (isAdmin() || orgKeyOf(request.resource.data) == myOrgKey())
//
// which validates the *incoming* document and nothing else. The document id is
// somebody's uid, so any organisation's HR administrator could overwrite the
// link of an account in any *other* organisation simply by stamping the
// payload with their own orgId, silently re-binding that account to whichever
// employeeId they named.
//
// The escalation landed inside the victim's own tenant: `myEmployeeId()`
// returned the named record and the victim's reads are scoped by *their* org,
// so naming their CEO's employeeId handed the victim their CEO's payslips —
// and cost them their own, which is the denial of service half.
//
// Neither existing suite covered this shape. salary-leave.rules.test.mjs has
// "HR cannot link an account into another organisation", but it stamps the
// document with the *victim's* org, which the org-key comparison already
// caught. Stamping your own org was the case that got through.
//
// Closed by `linkTargetInMyOrg(uid)`: the account being linked must be one of
// mine. Runs last because it is the most destructive thing in the file if it
// ever regresses.
// ---------------------------------------------------------------------------
describe('one tenant’s HR cannot hijack another tenant’s link', () => {
  const victimOrg = 'north';
  const victim = hire(victimOrg, 1);
  const attacker = hrOf(otherThan(victimOrg));
  /** An employee record in the victim's own organisation, not the attacker's. */
  const coveted = hire(victimOrg, 0).employeeId;

  it('baseline — the victim reads their own payslip and not their colleague’s', async () => {
    await assertSucceeds(getDoc(doc(as(victim), 'payslips', `ps-${victimOrg}-1`)));
    await assertFails(getDoc(doc(as(victim), 'payslips', `ps-${victimOrg}-0`)));
  });

  it('the other tenant’s HR cannot touch the link, however it is stamped', async () => {
    // Stamped with the attacker's own org — the variant that used to pass.
    await assertFails(setDoc(doc(as(attacker), 'employee_links', victim.uid), {
      uid: victim.uid, employeeId: coveted, orgId: org(otherThan(victimOrg)), linkedBy: attacker.uid,
    }));
    // Stamped with the victim's org — refused before this fix and still is.
    await assertFails(setDoc(doc(as(attacker), 'employee_links', victim.uid), {
      uid: victim.uid, employeeId: coveted, orgId: org(victimOrg), linkedBy: attacker.uid,
    }));
  });

  it('nor create one for an account that has no profile at all', async () => {
    await assertFails(setDoc(doc(as(attacker), 'employee_links', 'ghost-uid'), {
      uid: 'ghost-uid', employeeId: coveted, orgId: org(otherThan(victimOrg)), linkedBy: attacker.uid,
    }));
  });

  it('the victim is untouched — still their own payslip, still not the CEO’s', async () => {
    await assertSucceeds(getDoc(doc(as(victim), 'payslips', `ps-${victimOrg}-1`)));
    await assertFails(getDoc(doc(as(victim), 'payslips', `ps-${victimOrg}-0`)));
  });

  it('the victim’s own HR can still link them, which is the flow this protects', async () => {
    await assertSucceeds(setDoc(doc(as(hrOf(victimOrg)), 'employee_links', victim.uid), {
      uid: victim.uid, employeeId: victim.employeeId, orgId: org(victimOrg),
      linkedBy: hrOf(victimOrg).uid,
    }));
  });
});
