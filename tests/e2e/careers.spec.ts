/**
 * The public careers page, end to end.
 *
 * What this spec is for: the whole point of the feature is that somebody who is
 * *not signed in* can see a published role and apply for it, and that what they
 * submit arrives in the organisation's Firestore rather than in their own
 * browser. Both halves are invisible to the rest of the suite — every other
 * spec signs in first, and the localStorage-backed specs would pass just as
 * happily if the application never left the tab.
 *
 * So it asserts against Firestore directly after driving the form, the same way
 * location-directory.spec.ts does: the page saying "Application received" is
 * the page's claim, and the document is the fact.
 *
 * It lives in the `org-settings` project because it writes the organisation's
 * shared data — a published job opening, and applications against it — which is
 * exactly the class of write that must not run three times over in three
 * engines, and must not run against the live project by accident. See
 * SHARED_CONFIG_SPECS in playwright.config.ts.
 *
 * It cleans up after itself: the job posting and every application filed
 * against it are deleted in afterAll. A stranded Open role on a careers page is
 * the recruitment equivalent of the stranded "E2E Isolation Leave" policies —
 * visible to the public, and only removable by whoever notices.
 */
import { expect, test, type Page } from '@playwright/test';
import { HIRING_MANAGER_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken, signInPersona } from './firestore';

const ORG = 'default';
const JOB_ID = 'job-e2e-careers';
const JOB_TITLE = 'E2E Careers Test Engineer';
const APPLICANT_EMAIL = 'e2e.applicant@example.com';
const APPLICATION_ID = `${ORG}__${JOB_ID}__${APPLICANT_EMAIL}`;

/** The employee record the manager persona is linked to for these specs. */
const MANAGER_EMPLOYEE_ID = 'emp-e2e-hiring-manager';

/** The smallest thing a PDF-only upload will accept. */
const RESUME = {
  name: 'e2e-resume.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
};

async function firestore(path: string, init: RequestInit = {}) {
  const token = await adminToken();
  return fetch(`${FIRESTORE_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function publishTestJob(hiringManagerId = MANAGER_EMPLOYEE_ID) {
  const res = await firestore(`jobs/${JOB_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        id: { stringValue: JOB_ID },
        orgId: { stringValue: ORG },
        title: { stringValue: JOB_TITLE },
        department: { stringValue: 'Engineering' },
        location: { stringValue: 'Bengaluru' },
        type: { stringValue: 'Full-time' },
        status: { stringValue: 'Open' },
        openings: { integerValue: '1' },
        applicants: { integerValue: '0' },
        postedOn: { stringValue: '2026-01-01' },
        hiringManagerId: { stringValue: hiringManagerId },
        experience: { stringValue: '3–5 yrs' },
        description: { stringValue: 'A role that exists only for the end-to-end suite.' },
      },
    }),
  });
  expect(res.ok, `seeding jobs/${JOB_ID} failed: ${res.status}`).toBeTruthy();
}

async function readApplication(): Promise<Record<string, { stringValue?: string; integerValue?: string }> | null> {
  const res = await firestore(`job_applications/${APPLICATION_ID}`);
  if (res.status !== 200) return null;
  return (await res.json()).fields ?? null;
}

/** Fills and submits the apply form on an already-open job page. */
async function apply(page: import('@playwright/test').Page, email: string) {
  await page.fill('#apply-name', 'Asha Menon');
  await page.fill('#apply-email', email);
  await page.fill('#apply-phone', '+91 9810000000');
  await page.fill('#apply-experience', '5');
  await page.fill('#apply-company', 'Razorpay');
  await page.setInputFiles('#apply-resume', RESUME);
  await page.fill('#apply-note', 'Written by the end-to-end suite.');
  await page.getByRole('button', { name: 'Submit application' }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('careers page — applying without an account', () => {
  test.beforeAll(async () => {
    await publishTestJob();
    // A leftover application from an interrupted run would make the "one per
    // address" test pass for the wrong reason and the first test fail.
    await firestore(`job_applications/${APPLICATION_ID}`, { method: 'DELETE' });
  });

  test.afterAll(async () => {
    await firestore(`job_applications/${APPLICATION_ID}`, { method: 'DELETE' });
    await firestore(`jobs/${JOB_ID}`, { method: 'DELETE' });
  });

  test('a published role is listed and reachable with no sign-in', async ({ page }) => {
    await page.goto(`/careers/${ORG}`);

    // Never redirected to /login: this is the one page a candidate can reach.
    await expect(page).toHaveURL(new RegExp(`/careers/${ORG}$`));
    await expect(page.getByRole('heading', { name: 'Open roles' })).toBeVisible();

    await page.getByRole('link', { name: new RegExp(JOB_TITLE) }).click();
    await expect(page).toHaveURL(new RegExp(`/careers/${ORG}/${JOB_ID}$`));
    await expect(page.getByRole('heading', { name: JOB_TITLE })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apply for this role' })).toBeVisible();
  });

  test('an application reaches the organisation, not just the browser', async ({ page }) => {
    await page.goto(`/careers/${ORG}/${JOB_ID}`);
    await apply(page, APPLICANT_EMAIL);

    await expect(page.getByTestId('application-submitted')).toBeVisible();

    // The page's claim is not the fact. This is.
    const fields = await readApplication();
    expect(fields, 'the application never reached Firestore').not.toBeNull();
    expect(fields?.name?.stringValue).toBe('Asha Menon');
    expect(fields?.email?.stringValue).toBe(APPLICANT_EMAIL);
    expect(fields?.jobId?.stringValue).toBe(JOB_ID);
    expect(fields?.orgId?.stringValue).toBe(ORG);
    // Pinned by the rules, not by the form: an applicant cannot arrive
    // shortlisted or dressed up as an internal referral.
    expect(fields?.stage?.stringValue).toBe('Applied');
    expect(fields?.source?.stringValue).toBe('Website');
    expect(fields?.resumeContentType?.stringValue).toBe('application/pdf');
    expect(Number(fields?.resumeSizeBytes?.integerValue)).toBeGreaterThan(0);
  });

  test('applying twice with the same address is refused, and says so', async ({ page }) => {
    await page.goto(`/careers/${ORG}/${JOB_ID}`);
    await apply(page, APPLICANT_EMAIL);

    await expect(page.getByRole('alert')).toContainText('already applied');
    await expect(page.getByTestId('application-submitted')).toHaveCount(0);
  });

  test('a role that is not published is not on the page', async ({ page }) => {
    await firestore(`jobs/${JOB_ID}`, { method: 'DELETE' });
    await page.goto(`/careers/${ORG}`);
    await expect(page.getByRole('link', { name: new RegExp(JOB_TITLE) })).toHaveCount(0);
    // Put it back for afterAll's benefit and for anything re-run after this.
    await publishTestJob();
  });
});

/**
 * The other half: an application is no use to the person running the shortlist
 * unless they can act on it.
 *
 * The rules tests prove who *may* advance an application. What they cannot
 * reach is whether the page offers the buttons to the right person and routes
 * the write — a manager who is refused server-side and a manager who is simply
 * never shown a control look identical from a passing rules test.
 *
 * The `employee_links/{uid}` document is written here rather than read, unlike
 * in the salary specs where writing it would let the spec arrange the very
 * thing the app is supposed to establish. Nothing in *this* feature creates
 * that link — an administrator does, from Admin → Create account — so here it
 * is a precondition of the world, in the same class as the job posting above.
 */
test.describe('the hiring manager runs their own shortlist', () => {
  let managerUid = '';

  async function signIn(page: Page, persona: typeof HIRING_MANAGER_PERSONA) {
    await page.goto('/login');
    await page.locator('#username').fill(persona.email);
    await page.locator('#password').fill(persona.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
  }

  async function openApplicant(page: Page) {
    await page.goto('/recruitment');
    await page.getByRole('button', { name: /Candidate Pipeline/ }).click();
    await page.getByText('Asha Menon').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  }

  test.beforeAll(async () => {
    const { uid } = await signInPersona(HIRING_MANAGER_PERSONA.email, HIRING_MANAGER_PERSONA.password);
    expect(uid, 'could not resolve the manager persona uid').toBeTruthy();
    managerUid = uid as string;

    await firestore(`employee_links/${managerUid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          uid: { stringValue: managerUid },
          employeeId: { stringValue: MANAGER_EMPLOYEE_ID },
          orgId: { stringValue: ORG },
          linkedBy: { stringValue: 'e2e' },
        },
      }),
    });
    await publishTestJob();
    await firestore(`job_applications/${APPLICATION_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          orgId: { stringValue: ORG },
          jobId: { stringValue: JOB_ID },
          jobTitle: { stringValue: JOB_TITLE },
          name: { stringValue: 'Asha Menon' },
          email: { stringValue: APPLICANT_EMAIL },
          phone: { stringValue: '+91 9810000000' },
          experienceYears: { integerValue: '5' },
          source: { stringValue: 'Website' },
          stage: { stringValue: 'Applied' },
          appliedOn: { stringValue: '2026-08-07' },
          submittedAt: { stringValue: '2026-08-07T09:00:00.000Z' },
          resumeFileName: { stringValue: 'asha-menon.pdf' },
          resumeContentType: { stringValue: 'application/pdf' },
          resumeSizeBytes: { integerValue: '69' },
          resumeContentBase64: { stringValue: 'JVBERi0xLjQK' },
        },
      }),
    });
  });

  test.afterAll(async () => {
    await firestore(`job_applications/${APPLICATION_ID}`, { method: 'DELETE' });
    await firestore(`jobs/${JOB_ID}`, { method: 'DELETE' });
    if (managerUid) await firestore(`employee_links/${managerUid}`, { method: 'DELETE' });
  });

  test('the named hiring manager advances an applicant, and it lands', async ({ page }) => {
    await signIn(page, HIRING_MANAGER_PERSONA);
    await openApplicant(page);

    await expect(page.getByText('Move to')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Interview', exact: true }).click();

    // The button changing colour is not the point; the stored stage is.
    await expect
      .poll(async () => (await readApplication())?.stage?.stringValue, { timeout: 10_000 })
      .toBe('Interview');
  });

  test('a manager the job does not name is told why, not just shown nothing', async ({ page }) => {
    // Hand the role to somebody else while the same manager is signed in.
    await publishTestJob('emp-somebody-else');

    await signIn(page, HIRING_MANAGER_PERSONA);
    await openApplicant(page);

    await expect(page.getByRole('dialog')).toContainText('hiring manager');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Interview', exact: true }),
    ).toHaveCount(0);

    await publishTestJob();
  });
});
