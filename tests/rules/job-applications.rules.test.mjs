/**
 * Job-application security-rules tests.
 *
 * This is the one place in the application where an unauthenticated caller may
 * write, so it is the one place where "the client wouldn't do that" is worth
 * nothing at all. The E2E suite drives a form that only ever submits what the
 * form was built to submit; none of what follows is reachable through it.
 *
 * The claims the careers page rests on:
 *
 *   1. Anybody can apply for a role an organisation has published as Open,
 *      without an account, because a candidate cannot have one.
 *   2. Nobody can apply for anything else — a Draft, a Closed role, a role in
 *      another organisation, or a job id that does not exist.
 *   3. An application arrives at the start of the pipeline. It cannot arrive
 *      pre-shortlisted, cannot claim to be an internal referral, and cannot
 *      claim to have been submitted by a signed-in account.
 *   4. One application per address per job. The document id is recomputed from
 *      the payload, so a caller cannot spray documents at ids of their own
 *      choosing, and cannot overwrite an application already filed — which
 *      matters because the address is half of the id and therefore guessable.
 *   5. No applicant can read an application, including their own. The resumes
 *      and phone numbers in this collection are the organisation's to read.
 *   6. An organisation reads and advances its own applications only, and
 *      advancing one cannot double as rewriting it.
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
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const HOST = '127.0.0.1';
const PORT = 8080;

const USERS = {
  hrA: { uid: 'hr-a', email: 'hr-a@example.com', role: 'hr', orgId: 'org-a' },
  adminA: { uid: 'admin-a', email: 'admin-a@example.com', role: 'admin', orgId: 'org-a' },
  // managerA is linked to emp-a-hiring, which OPEN_JOB names as its hiring
  // manager. otherManagerA holds the same role in the same org and is named on
  // nothing. unlinkedManagerA has no employee_links document at all.
  managerA: { uid: 'manager-a', email: 'manager-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a-hiring' },
  otherManagerA: { uid: 'other-manager-a', email: 'other-manager-a@example.com', role: 'manager', orgId: 'org-a', employeeId: 'emp-a-other' },
  unlinkedManagerA: { uid: 'unlinked-manager-a', email: 'unlinked-manager-a@example.com', role: 'manager', orgId: 'org-a' },
  employeeA: { uid: 'employee-a', email: 'employee-a@example.com', role: 'employee', orgId: 'org-a', employeeId: 'emp-a-hiring' },
  hrB: { uid: 'hr-b', email: 'hr-b@example.com', role: 'hr', orgId: 'org-b' },
  // Same employee id as managerA, in the other organisation — `emp-*` ids are
  // per-org sequences, so a rule that matched on the id alone would let this
  // account move org-a's candidates.
  managerB: { uid: 'manager-b', email: 'manager-b@example.com', role: 'manager', orgId: 'org-b', employeeId: 'emp-a-hiring' },
};

/** The employee the open role names as its hiring manager. */
const HIRING_MANAGER_ID = 'emp-a-hiring';

const OPEN_JOB = 'job-open-a';
const DRAFT_JOB = 'job-draft-a';
const OPEN_JOB_B = 'job-open-b';

const APPLICANT = 'asha@example.com';
const APPLICATION_ID = `org-a__${OPEN_JOB}__${APPLICANT}`;

let testEnv;

function as(user) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

/** A valid public application, overridable per test. */
function application(overrides = {}) {
  return {
    orgId: 'org-a',
    jobId: OPEN_JOB,
    jobTitle: 'Senior Backend Engineer',
    name: 'Asha Menon',
    email: APPLICANT,
    phone: '+91 9810000000',
    currentCompany: 'Razorpay',
    experienceYears: 5,
    coverNote: 'I have shipped this exact system twice.',
    source: 'Website',
    stage: 'Applied',
    appliedOn: '2026-08-07',
    submittedAt: '2026-08-07T09:00:00.000Z',
    resumeFileName: 'asha-menon.pdf',
    resumeContentType: 'application/pdf',
    resumeSizeBytes: 4096,
    resumeContentBase64: 'JVBERi0xLjQK',
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
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.email,
        role: user.role,
        orgId: user.orgId,
      });
      // The administrator-authored link the rules resolve identity through.
      // Deliberately absent for unlinkedManagerA — see that persona.
      if (user.employeeId) {
        await setDoc(doc(db, 'employee_links', user.uid), {
          uid: user.uid,
          employeeId: user.employeeId,
          orgId: user.orgId,
          linkedBy: 'seed',
        });
      }
    }
    await setDoc(doc(db, 'jobs', OPEN_JOB), {
      id: OPEN_JOB,
      orgId: 'org-a',
      title: 'Senior Backend Engineer',
      status: 'Open',
      hiringManagerId: HIRING_MANAGER_ID,
    });
    await setDoc(doc(db, 'jobs', DRAFT_JOB), {
      id: DRAFT_JOB, orgId: 'org-a', title: 'Financial Analyst', status: 'Draft',
    });
    await setDoc(doc(db, 'jobs', OPEN_JOB_B), {
      id: OPEN_JOB_B, orgId: 'org-b', title: 'Account Executive', status: 'Open',
    });
  });
});

/** Files an application straight into the store, bypassing the rules. */
async function seedApplication(overrides = {}) {
  const payload = application(overrides);
  const id = `${payload.orgId}__${payload.jobId}__${payload.email}`;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'job_applications', id), payload);
  });
  return id;
}

describe('published jobs are readable without an account', () => {
  it('an open role can be read by a stranger', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'jobs', OPEN_JOB)));
  });

  it('a query for one org\'s open roles succeeds unauthenticated', async () => {
    await assertSucceeds(getDocs(query(
      collection(anon(), 'jobs'),
      where('orgId', '==', 'org-a'),
      where('status', '==', 'Open'),
    )));
  });

  it('a draft is not published, and a stranger cannot read it', async () => {
    await assertFails(getDoc(doc(anon(), 'jobs', DRAFT_JOB)));
  });

  it('dropping the status filter asks for the drafts too, and is denied whole', async () => {
    await assertFails(getDocs(query(
      collection(anon(), 'jobs'),
      where('orgId', '==', 'org-a'),
    )));
  });

  it('an organisation still reads its own roles whatever the status', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.hrA), 'jobs', DRAFT_JOB)));
  });

  it('and still cannot read another organisation\'s non-public roles', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'jobs', 'job-draft-b'), {
        id: 'job-draft-b', orgId: 'org-b', status: 'Draft',
      });
    });
    await assertFails(getDoc(doc(as(USERS.hrA), 'jobs', 'job-draft-b')));
  });
});

describe('applying without an account', () => {
  it('a stranger can apply for an open role', async () => {
    await assertSucceeds(
      setDoc(doc(anon(), 'job_applications', APPLICATION_ID), application()),
    );
  });

  it('cannot apply for a draft role', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', `org-a__${DRAFT_JOB}__${APPLICANT}`),
      application({ jobId: DRAFT_JOB }),
    ));
  });

  it('cannot apply for a role that does not exist', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', `org-a__job-invented__${APPLICANT}`),
      application({ jobId: 'job-invented' }),
    ));
  });

  it('cannot file an application into another org against that org\'s job', async () => {
    // org-b's role is genuinely open; the applicant stamps org-a to try to have
    // it land in org-a's pipeline. The job's own orgId is what is checked.
    await assertFails(setDoc(
      doc(anon(), 'job_applications', `org-a__${OPEN_JOB_B}__${APPLICANT}`),
      application({ jobId: OPEN_JOB_B }),
    ));
  });

  it('cannot arrive already shortlisted', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ stage: 'Offer' }),
    ));
  });

  it('cannot claim to be an internal referral', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ source: 'Internal' }),
    ));
  });

  it('cannot claim to have been submitted by a signed-in account', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ submittedByUid: USERS.hrA.uid }),
    ));
  });

  it('cannot choose its own document id', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', 'anything-i-like'),
      application(),
    ));
  });

  it('cannot file under one address at another address\'s id', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', `org-a__${OPEN_JOB}__someone.else@example.com`),
      application(),
    ));
  });

  it('cannot overwrite an application already filed', async () => {
    await seedApplication();
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ name: 'Not Asha', phone: '+91 9999999999' }),
    ));
  });

  it('cannot attach fields nobody is checking', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ padding: 'x'.repeat(50_000) }),
    ));
  });

  it('must attach a resume', async () => {
    const { resumeContentBase64, ...withoutResume } = application();
    await assertFails(
      setDoc(doc(anon(), 'job_applications', APPLICATION_ID), withoutResume),
    );
  });

  it('the resume must be a PDF', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ resumeContentType: 'application/x-msdownload' }),
    ));
  });

  it('the resume must be within the size limit', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ resumeSizeBytes: 5 * 1024 * 1024 }),
    ));
  });

  it('the cover note is bounded', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ coverNote: 'x'.repeat(4001) }),
    ));
  });

  it('the address has to look like one, and has to be the stored form', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', 'org-a__job-open-a__notanaddress'),
      application({ email: 'notanaddress' }),
    ));
    await assertFails(setDoc(
      doc(anon(), 'job_applications', 'org-a__job-open-a__Asha@Example.com'),
      application({ email: 'Asha@Example.com' }),
    ));
  });

  it('years of experience must be a plausible whole number', async () => {
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ experienceYears: 500 }),
    ));
    await assertFails(setDoc(
      doc(anon(), 'job_applications', APPLICATION_ID),
      application({ experienceYears: '5' }),
    ));
  });
});

describe('applying from inside the app', () => {
  const INTERNAL_ID = `org-a__${OPEN_JOB}__employee-a@example.com`;

  function internal(overrides = {}) {
    return application({
      email: 'employee-a@example.com',
      source: 'Internal',
      submittedByUid: USERS.employeeA.uid,
      ...overrides,
    });
  }

  it('an employee can apply for a role in their own organisation', async () => {
    await assertSucceeds(
      setDoc(doc(as(USERS.employeeA), 'job_applications', INTERNAL_ID), internal()),
    );
  });

  it('cannot apply as somebody else', async () => {
    await assertFails(setDoc(
      doc(as(USERS.employeeA), 'job_applications', INTERNAL_ID),
      internal({ submittedByUid: USERS.hrA.uid }),
    ));
  });

  it('cannot apply into another organisation', async () => {
    await assertFails(setDoc(
      doc(as(USERS.hrB), 'job_applications', `org-a__${OPEN_JOB}__hr-b@example.com`),
      internal({ email: 'hr-b@example.com', submittedByUid: USERS.hrB.uid }),
    ));
  });

  it('an internal application still cannot arrive shortlisted', async () => {
    await assertFails(setDoc(
      doc(as(USERS.employeeA), 'job_applications', INTERNAL_ID),
      internal({ stage: 'Interview' }),
    ));
  });
});

describe('reading applications', () => {
  it('an applicant cannot read back their own application', async () => {
    await seedApplication();
    await assertFails(getDoc(doc(anon(), 'job_applications', APPLICATION_ID)));
  });

  it('an employee of the organisation cannot read applications', async () => {
    await seedApplication();
    await assertFails(getDoc(doc(as(USERS.employeeA), 'job_applications', APPLICATION_ID)));
  });

  it('a hiring manager reads them — the pipeline is their page too', async () => {
    await seedApplication();
    await assertSucceeds(getDoc(doc(as(USERS.managerA), 'job_applications', APPLICATION_ID)));
  });

  it('HR reads their own organisation\'s applications', async () => {
    await seedApplication();
    await assertSucceeds(getDocs(query(
      collection(as(USERS.hrA), 'job_applications'),
      where('orgId', '==', 'org-a'),
    )));
  });

  it('another organisation\'s HR cannot', async () => {
    await seedApplication();
    await assertFails(getDoc(doc(as(USERS.hrB), 'job_applications', APPLICATION_ID)));
    await assertFails(getDocs(query(
      collection(as(USERS.hrB), 'job_applications'),
      where('orgId', '==', 'org-a'),
    )));
  });
});

describe('advancing an application', () => {
  it('HR can move it through the pipeline', async () => {
    const id = await seedApplication();
    await assertSucceeds(updateDoc(doc(as(USERS.hrA), 'job_applications', id), { stage: 'Interview' }));
  });

  it('an admin of the same organisation can too', async () => {
    const id = await seedApplication();
    await assertSucceeds(updateDoc(doc(as(USERS.adminA), 'job_applications', id), { stage: 'Screening' }));
  });

  it('an employee cannot', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.employeeA), 'job_applications', id), { stage: 'Hired' }));
  });

  it('the job\'s own hiring manager can move their shortlist', async () => {
    const id = await seedApplication();
    await assertSucceeds(updateDoc(doc(as(USERS.managerA), 'job_applications', id), { stage: 'Offer' }));
  });

  it('a manager the job does not name cannot', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.otherManagerA), 'job_applications', id), { stage: 'Offer' }));
  });

  // The account resolves to no employee record, so it matches no
  // hiringManagerId. Fails closed — which is right, and which the page has to
  // explain rather than silently withhold the buttons.
  it('a manager whose account is not linked to an employee record cannot', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.unlinkedManagerA), 'job_applications', id), { stage: 'Offer' }));
  });

  // employeeA is linked to the very id the job names, and is still an
  // employee: the pipeline is not an employee's to move.
  it('being named on the job is not enough without the Manager role', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.employeeA), 'job_applications', id), { stage: 'Offer' }));
  });

  // `emp-*` ids are per-org sequences, so managerB is linked to the same id in
  // a different organisation. Matching on the id alone would be a tenant leak.
  it('the same employee id in another organisation matches nothing here', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.managerB), 'job_applications', id), { stage: 'Offer' }));
  });

  it('the hiring manager still cannot rewrite the applicant while advancing them', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.managerA), 'job_applications', id), {
      stage: 'Offer',
      email: 'someone.else@example.com',
    }));
  });

  it('and still cannot delete the application — that is an administrator\'s act', async () => {
    const id = await seedApplication();
    await assertFails(deleteDoc(doc(as(USERS.managerA), 'job_applications', id)));
  });

  it('a stranger cannot', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(anon(), 'job_applications', id), { stage: 'Hired' }));
  });

  it('another organisation cannot', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.hrB), 'job_applications', id), { stage: 'Rejected' }));
  });

  it('advancing cannot double as rewriting the applicant', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.hrA), 'job_applications', id), {
      stage: 'Interview',
      email: 'someone.else@example.com',
    }));
    await assertFails(updateDoc(doc(as(USERS.hrA), 'job_applications', id), {
      stage: 'Interview',
      resumeContentBase64: 'c29tZXRoaW5nIGVsc2U=',
    }));
  });

  it('the stage has to be a stage', async () => {
    const id = await seedApplication();
    await assertFails(updateDoc(doc(as(USERS.hrA), 'job_applications', id), { stage: 'Employed' }));
  });
});

describe('deleting an application', () => {
  it('is the organisation\'s call', async () => {
    const id = await seedApplication();
    await assertSucceeds(deleteDoc(doc(as(USERS.hrA), 'job_applications', id)));
  });

  it('and nobody else\'s', async () => {
    const id = await seedApplication();
    await assertFails(deleteDoc(doc(anon(), 'job_applications', id)));
    await assertFails(deleteDoc(doc(as(USERS.employeeA), 'job_applications', id)));
    await assertFails(deleteDoc(doc(as(USERS.hrB), 'job_applications', id)));
  });
});
