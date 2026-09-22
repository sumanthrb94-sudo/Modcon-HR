/**
 * The super admin is not a tenant, and this is where that is proved.
 *
 * `inMyOrg()` and `writingToMyOrg()` used to begin `isSuperAdmin() ||`. Between
 * them they gate 29 collections — every payslip, PAN, bank account, attendance
 * stamp, leave decision and candidate résumé on the platform — so one account
 * could read and write all of it, in every organisation, leaving no record that
 * it had. The app hid the routes (`isSuperAdminInsideOrg`, `RequireOrgContext`,
 * the `platform` nav filter), but hiding a route is not a boundary; this file is.
 *
 * Two halves, and they have to be asserted together or the fix trades one
 * failure for another:
 *
 *   1. the platform account is refused tenant data, and
 *   2. it can still do the four things it exists for — onboard an
 *      organisation, provision its first HR login, read the org list, and
 *      handle billing.
 *
 * The third group is the regression the sentinel exists to stop. Removing the
 * exemption alone would not lock the super admin out: `myOrgKey()` resolved an
 * account with no orgId to 'default', so the platform account would have become
 * a *member of the default organisation* — which holds real records on the live
 * project — and kept tenant access under a different name. `~unassigned~`
 * matches no document, which is what makes the boundary real rather than moved.
 */
import { before, after, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const SUPER = { uid: 'super-a', email: 'super-a@example.com', role: 'admin', superAdmin: true };
const HR_A = { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' };
const HR_LEGACY = { uid: 'hr-legacy', email: 'hr-legacy@example.com', role: 'hr', orgId: 'default' };

/**
 * Tenant collections scoped purely by orgId. One document per collection in
 * org-a, which the platform account must not reach.
 */
const TENANT = [
  'employees', 'attendance', 'payroll_runs', 'jobs', 'candidates',
  'onboarding', 'goals', 'performance_reviews', 'assets',
  'billing_preferences', 'billing_invoices', 'expenses',
  'helpdesk_tickets', 'regularizations', 'leave_requests', 'leave_balances',
  'payslips', 'employee_compensation', 'org_posts',
];

let testEnv;
const as = (user) => testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    for (const u of [SUPER, HR_A, HR_LEGACY]) {
      await setDoc(doc(db, 'users', u.uid), {
        uid: u.uid, email: u.email, displayName: u.email, role: u.role,
        ...(u.orgId ? { orgId: u.orgId } : {}),
        ...(u.superAdmin ? { superAdmin: true } : {}),
      });
    }

    for (const name of TENANT) {
      await setDoc(doc(db, name, 'doc-a'), { id: 'doc-a', orgId: 'org-a', employeeId: 'emp-a', status: 'Pending', managerChainIds: [], label: 'org A' });
      // The default tenant is not a free-for-all either: it is a real
      // organisation with real records, and the sentinel is what keeps the
      // platform account out of it.
      await setDoc(doc(db, name, 'doc-default'), { id: 'doc-default', orgId: 'default', employeeId: 'emp-l', status: 'Pending', managerChainIds: [], label: 'legacy org' });
    }

    await setDoc(doc(db, 'org_records', 'org-a__employees__emp-a'), {
      orgId: 'org-a', store: 'employees', recordId: 'emp-a', deleted: false,
      data: JSON.stringify({ id: 'emp-a', fullName: 'Someone', ctc: 2400000 }), status: 'Active',
    });
    await setDoc(doc(db, 'org_records', 'default__employees__emp-l'), {
      orgId: 'default', store: 'employees', recordId: 'emp-l', deleted: false,
      data: JSON.stringify({ id: 'emp-l', fullName: 'Legacy', ctc: 900000 }), status: 'Active',
    });

    await setDoc(doc(db, 'org_settings', 'org-a__salaryStructure'), {
      orgId: 'org-a', key: 'salaryStructure', valueJson: '{"basicPercent":45}',
    });
    await setDoc(doc(db, 'org_settings', 'org-a__employeeSalaryStructures'), {
      orgId: 'org-a', key: 'employeeSalaryStructures', valueJson: '{"emp-a":{"basicPercent":60}}',
    });
    await setDoc(doc(db, 'attendance_geofences', 'org-a'), {
      orgId: 'org-a', mode: 'advisory', maxAccuracyMetres: 150, sites: {},
    });
    await setDoc(doc(db, 'handbook', 'org-a'), {
      orgId: 'org-a', currentVersionId: 'v1', updatedByUid: 'hr-a',
    });
    await setDoc(doc(db, 'employee_documents', 'org-a__emp-a__pan-card'), {
      id: 'org-a__emp-a__pan-card', orgId: 'org-a', employeeId: 'emp-a',
      name: 'PAN Card', type: 'PDF', status: 'Verified', uploaded: '2026-01-01', size: '1 KB',
      uploadedByUid: 'hr-a',
    });
    await setDoc(doc(db, 'payslip_documents', 'org-a__emp-a__2026-09'), {
      orgId: 'org-a', employeeId: 'emp-a', month: '2026-09', contentBase64: 'x', sizeBytes: 1,
    });
    await setDoc(doc(db, 'attendance_stamps', 'stamp-a'), {
      orgId: 'org-a', employeeId: 'emp-a', kind: 'check-in',
    });
    await setDoc(doc(db, 'job_applications', 'org-a__job-1__a@example.com'), {
      orgId: 'org-a', jobId: 'job-1', email: 'a@example.com', name: 'Applicant',
      stage: 'Applied', source: 'Website',
    });

    // Platform-side fixtures.
    await setDoc(doc(db, 'organizations', 'org-a'), {
      name: 'Org A', adminEmail: 'hr-a@example.com', createdBy: 'super-a',
    });
    await setDoc(doc(db, 'subscription_requests', 'req-1'), {
      orgId: 'org-a', status: 'open', createdAt: new Date().toISOString(),
    });
  });
});

// ---------------------------------------------------------------------------

describe('super admin — refused every tenant collection', () => {
  for (const name of TENANT) {
    it(`${name}: cannot read an organisation's record`, async () => {
      await assertFails(getDoc(doc(as(SUPER), name, 'doc-a')));
    });

    it(`${name}: cannot write into an organisation`, async () => {
      await assertFails(setDoc(doc(as(SUPER), name, 'doc-a'), {
        id: 'doc-a', orgId: 'org-a', employeeId: 'emp-a', status: 'Approved',
        managerChainIds: [], label: 'edited by the platform',
      }));
    });
  }

  it('org_records: cannot read a salary record', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'org_records', 'org-a__employees__emp-a')));
  });

  it('org_records: cannot write one', async () => {
    await assertFails(setDoc(doc(as(SUPER), 'org_records', 'org-a__employees__emp-a'), {
      orgId: 'org-a', store: 'employees', recordId: 'emp-a', deleted: false,
      data: JSON.stringify({ id: 'emp-a', ctc: 1 }), status: 'Active',
    }));
  });

  it('org_settings: cannot read configuration', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'org_settings', 'org-a__salaryStructure')));
  });

  it('org_settings: cannot read a per-employee pay override', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'org_settings', 'org-a__employeeSalaryStructures')));
  });

  it('employee_documents: cannot read a PAN card record', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'employee_documents', 'org-a__emp-a__pan-card')));
  });

  it('payslip_documents: cannot read an issued payslip', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'payslip_documents', 'org-a__emp-a__2026-09')));
  });

  it('attendance_stamps: cannot read check-in evidence', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'attendance_stamps', 'stamp-a')));
  });

  it('job_applications: cannot read a candidate', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'job_applications', 'org-a__job-1__a@example.com')));
  });

  it('attendance_geofences: cannot read a fence', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'attendance_geofences', 'org-a')));
  });

  it('handbook: cannot read it', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'handbook', 'org-a')));
  });

  it('an org-filtered list is denied too, not merely empty', async () => {
    await assertFails(getDocs(query(
      collection(as(SUPER), 'employees'), where('orgId', '==', 'org-a'),
    )));
  });
});

// ---------------------------------------------------------------------------

describe('super admin — the default organisation is a tenant like any other', () => {
  // The regression the '~unassigned~' sentinel prevents. A super admin carries
  // no orgId; while myOrgKey() answered 'default' for them, dropping the
  // exemption would have made them a member of that organisation rather than
  // a member of none.
  it('cannot read the default org\'s employee record', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'employees', 'doc-default')));
  });

  it('cannot read the default org\'s org_records', async () => {
    await assertFails(getDoc(doc(as(SUPER), 'org_records', 'default__employees__emp-l')));
  });

  it('cannot write into the default org', async () => {
    await assertFails(setDoc(doc(as(SUPER), 'employees', 'doc-default'), {
      id: 'doc-default', orgId: 'default', label: 'edited by the platform',
    }));
  });

  it('but the default org\'s own HR still reads it', async () => {
    await assertSucceeds(getDoc(doc(as(HR_LEGACY), 'employees', 'doc-default')));
  });
});

// ---------------------------------------------------------------------------

describe('super admin — still does the job it exists for', () => {
  it('reads the organisation list', async () => {
    await assertSucceeds(getDoc(doc(as(SUPER), 'organizations', 'org-a')));
  });

  it('creates an organisation', async () => {
    await assertSucceeds(setDoc(doc(as(SUPER), 'organizations', 'org-new'), {
      name: 'Newly onboarded', adminEmail: 'hr-new@example.com', createdBy: SUPER.uid,
    }));
  });

  it('updates an organisation — subscription and billing live here', async () => {
    await assertSucceeds(setDoc(doc(as(SUPER), 'organizations', 'org-a'), {
      name: 'Org A', adminEmail: 'hr-a@example.com', createdBy: 'super-a',
      paidThrough: '2027-09-30T00:00:00.000Z', planName: 'Growth', seats: 25,
    }));
  });

  it('provisions the first HR account for a new organisation', async () => {
    await assertSucceeds(setDoc(doc(as(SUPER), 'users', 'hr-new'), {
      uid: 'hr-new', email: 'hr-new@example.com', displayName: 'New HR',
      role: 'hr', orgId: 'org-new',
    }));
  });

  it('grants a role before the account exists', async () => {
    await assertSucceeds(setDoc(doc(as(SUPER), 'role_assignments', 'hr-new@example.com'), {
      email: 'hr-new@example.com', role: 'hr', orgId: 'org-new', assignedBy: SUPER.uid,
    }));
  });

  it('reads subscription requests across organisations', async () => {
    await assertSucceeds(getDoc(doc(as(SUPER), 'subscription_requests', 'req-1')));
  });

  it('closes a subscription request', async () => {
    await assertSucceeds(setDoc(doc(as(SUPER), 'subscription_requests', 'req-1'), {
      orgId: 'org-a', status: 'closed', createdAt: new Date().toISOString(),
    }));
  });
});

// ---------------------------------------------------------------------------

describe('super admin — the tenant is unaffected by all of this', () => {
  it('HR still reads their own organisation', async () => {
    await assertSucceeds(getDoc(doc(as(HR_A), 'employees', 'doc-a')));
  });

  it('HR still reads their own configuration', async () => {
    await assertSucceeds(getDoc(doc(as(HR_A), 'org_settings', 'org-a__salaryStructure')));
  });

  it('HR still cannot reach another organisation', async () => {
    await assertFails(getDoc(doc(as(HR_A), 'employees', 'doc-default')));
  });
});
