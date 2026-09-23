import { test, expect, type Page } from '@playwright/test';
import { APPROVALS_MANAGER_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken, seedOrgRecords, signInPersona, waitForOrgRecord } from './firestore';

/**
 * A manager's approval queues hold their reports' requests: all of them, and
 * nobody else's.
 *
 * Two QA failures, found live in one pass, pulling in opposite directions:
 *
 *  - **Regularizations were not scoped at all.** Priya (Manager, one report —
 *    Karthik) was offered Meera's and Sanjay's with working buttons, and
 *    nothing on the client or the server would have refused the decision.
 *  - **Expense claims were scoped to nothing.** The same Priya saw no pending
 *    claims, Karthik's own included. The claim was stored correctly —
 *    `readableBy` named her — but her narrowed subscription had started before
 *    her `employee_links` document resolved, asked for `~nobody~`, and never
 *    asked again. The tab-isolation fix removed the shared cache that had been
 *    hiding it.
 *
 * Every earlier spec of this ran as a role persona with no link, which is why
 * neither was caught: for an account that is nobody, an empty queue is the
 * right answer, so a queue that is always empty passes. This one signs in as
 * a manager who IS somebody, in a fresh context — no warm link cache, which is
 * exactly the state the second bug needed.
 *
 * In the org-settings project: it writes the organisation's shared records
 * and a link document, and removes what it wrote.
 */

const ORG = 'default';
const LEAD = 'emp-e2e-aq-lead';
const REPORT = 'emp-e2e-aq-report';
const OUTSIDER = 'emp-e2e-aq-outsider';

function person(id: string, fullName: string, email: string, reportsTo: string | null) {
  const [firstName, ...rest] = fullName.split(' ');
  return {
    id,
    employeeCode: id.toUpperCase(),
    firstName,
    lastName: rest.join(' '),
    fullName,
    email,
    phone: '+91 90000 00000',
    avatar: 'brand',
    dateOfBirth: '1990-01-01',
    designation: 'Engineer',
    department: 'Engineering',
    location: 'Bengaluru',
    employmentType: 'Full-time',
    status: 'Active',
    dateOfJoining: '2024-01-01',
    reportingManagerId: reportsTo,
    ctc: 1200000,
  };
}

const claim = (id: string, employeeId: string) => ({
  id,
  employeeId,
  title: `E2E queue claim ${id}`,
  category: 'Meals',
  amount: 300,
  date: '2026-09-01',
  status: 'Submitted',
  submittedOn: '2026-09-01',
  description: 'E2E approvals queue scope.',
});

const regularization = (employeeId: string) => ({
  id: `reg-${employeeId}-2026-09-02`,
  employeeId,
  date: '2026-09-02',
  reason: 'E2E approvals queue scope.',
  requestedStatus: 'Present',
  status: 'Pending',
});

async function firestore(path: string, init: RequestInit = {}) {
  const token = await adminToken();
  return fetch(`${FIRESTORE_BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(APPROVALS_MANAGER_PERSONA.email);
  await page.locator('#password').fill(APPROVALS_MANAGER_PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 20_000 });
}

const SEEDED: Array<[string, string]> = [
  ['employees', LEAD],
  ['employees', REPORT],
  ['employees', OUTSIDER],
  ['expenseClaims', 'exp-e2e-aq-report'],
  ['expenseClaims', 'exp-e2e-aq-outsider'],
  ['regularizationOverrides', `reg-${REPORT}-2026-09-02`],
  ['regularizationOverrides', `reg-${OUTSIDER}-2026-09-02`],
];

test.describe.serial('a manager’s approval queues follow their reporting line', () => {
  let managerUid = '';

  test.beforeAll(async () => {
    const { uid } = await signInPersona(APPROVALS_MANAGER_PERSONA.email, APPROVALS_MANAGER_PERSONA.password);
    expect(uid, 'could not resolve the approvals manager uid').toBeTruthy();
    managerUid = uid as string;

    await seedOrgRecords('employees', [
      person(LEAD, 'E2E Queue Lead', APPROVALS_MANAGER_PERSONA.email, null),
      person(REPORT, 'E2E Queue Report', 'e2e-aq-report@modcon-hr.test', LEAD),
      person(OUTSIDER, 'E2E Queue Outsider', 'e2e-aq-outsider@modcon-hr.test', null),
    ]);
    // The claims as the app writes them: readable by the subject and everyone
    // above them. Karthik's claim in production carried exactly this.
    await seedOrgRecords('expenseClaims', [claim('exp-e2e-aq-report', REPORT), claim('exp-e2e-aq-outsider', OUTSIDER)], {
      employeeId: (r) => r.employeeId,
      readableBy: (r) => (r.employeeId === REPORT ? [REPORT, LEAD] : [r.employeeId]),
    });
    await seedOrgRecords('regularizationOverrides', [regularization(REPORT), regularization(OUTSIDER)], {
      employeeId: (r) => r.employeeId,
    });

    // Who this account is, as an administrator would have said it. A
    // precondition of the world rather than something under test.
    const res = await firestore(`employee_links/${managerUid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          uid: { stringValue: managerUid },
          employeeId: { stringValue: LEAD },
          orgId: { stringValue: ORG },
          linkedBy: { stringValue: 'e2e' },
        },
      }),
    });
    expect(res.ok, 'seeding employee_links').toBeTruthy();
  });

  test.afterAll(async () => {
    if (managerUid) await firestore(`employee_links/${managerUid}`, { method: 'DELETE' });
    for (const [store, id] of SEEDED) {
      await firestore(`org_records/${ORG}__${store}__${id}`, { method: 'DELETE' });
    }
  });

  test('the expense queue shows the report’s claim, and only theirs', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/pending-approvals/expense-claims');
    const row = (employeeId: string) =>
      page.locator(`[data-testid="expense-approval-claim"][data-employee-id="${employeeId}"]`);

    // The regression: this was empty, because the subscription asked for
    // nobody's claims and never asked again once the link resolved.
    await expect(row(REPORT)).toHaveCount(1, { timeout: 20_000 });
    await expect(row(OUTSIDER)).toHaveCount(0);
  });

  test('the regularization queue shows the report’s, and only theirs', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/pending-approvals/regularizations');
    const row = (employeeId: string) =>
      page.locator(`[data-testid="regularization-approval-request"][data-employee-id="${employeeId}"]`);

    await expect(row(REPORT)).toHaveCount(1, { timeout: 20_000 });
    // The row QA was wrongly offered, with a working Approve button on it.
    await expect(row(OUTSIDER)).toHaveCount(0);
  });

  test('approving the report’s regularization lands on the server', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/pending-approvals/regularizations');
    const row = page.locator(`[data-testid="regularization-approval-request"][data-employee-id="${REPORT}"]`);
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row).toHaveCount(0);

    await waitForOrgRecord<{ status?: string }>(
      'regularizationOverrides',
      `reg-${REPORT}-2026-09-02`,
      (r) => r?.status === 'Approved',
    );
    // And the outsider's is untouched, whatever the page did.
    const outsider = await waitForOrgRecord<{ status?: string }>(
      'regularizationOverrides',
      `reg-${OUTSIDER}-2026-09-02`,
      (r) => r !== null,
    );
    expect(outsider?.status).toBe('Pending');
  });
});
