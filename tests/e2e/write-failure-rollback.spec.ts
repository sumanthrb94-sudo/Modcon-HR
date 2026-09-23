import { test, expect } from '@playwright/test';
import { ROLLBACK_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken, seedOrgRecords, setStoredRole, signInPersona } from './firestore';

/**
 * A change the server refused does not stay on screen (G7, R4-M1).
 *
 * Writes to `org_records` are optimistic by design: `save()` writes the cache,
 * fires its change event and returns, and the commit follows without being
 * awaited. What was not by design is what used to happen when that commit
 * FAILED: a warning to a console nobody has open, while the cache went on
 * showing the change — a refused approval that looked exactly like one that
 * had landed, and survived a reload.
 *
 * ## How the refusal is produced
 *
 * An earlier version aborted the write channel. That never reaches the
 * rollback: an aborted request is UNAVAILABLE, which the Web SDK retries
 * forever, so `batch.commit()` never rejects. The case that matters is a
 * definitive `permission-denied`, and the honest way to get one is a page
 * that believes it may do something the server has since stopped allowing.
 *
 * So: a manager opens their approvals queue, and their role is then changed
 * to `employee` on the server through the emulator's owner bypass. That write
 * never reaches the app's Watch stream (CLAUDE.md records this trap), so the
 * page still shows Approve — while `expenseDecisionIsAuthorised` now refuses
 * the decision. It is the same shape as a real revocation racing a click.
 *
 * In the org-settings project, with a persona of its own: it writes an
 * `employee_links` document and rewrites the persona's role, both shared by
 * every project in a run.
 */

const ORG = 'default';
const LEAD = 'emp-e2e-rb-lead';
const REPORT = 'emp-e2e-rb-report';
const CLAIM_ID = 'exp-e2e-rollback';

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

async function firestore(path: string, init: RequestInit = {}) {
  const token = await adminToken();
  return fetch(`${FIRESTORE_BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

test.describe.serial('a refused write', () => {
  let uid = '';

  test.beforeAll(async () => {
    const signedIn = await signInPersona(ROLLBACK_PERSONA.email, ROLLBACK_PERSONA.password);
    expect(signedIn.uid, 'could not resolve the rollback persona uid').toBeTruthy();
    uid = signedIn.uid as string;
    await setStoredRole(uid, 'manager');

    await seedOrgRecords('employees', [
      person(LEAD, 'E2E Rollback Lead', ROLLBACK_PERSONA.email, null),
      person(REPORT, 'E2E Rollback Report', 'e2e-rb-report@modcon-hr.test', LEAD),
    ]);
    await seedOrgRecords(
      'expenseClaims',
      [{
        id: CLAIM_ID,
        employeeId: REPORT,
        title: 'E2E rollback claim',
        category: 'Travel',
        amount: 850,
        date: '2026-09-01',
        status: 'Submitted',
        submittedOn: '2026-09-01',
        description: 'E2E write-failure rollback.',
      }],
      { employeeId: (r) => r.employeeId, readableBy: () => [REPORT, LEAD] },
    );
    const res = await firestore(`employee_links/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          uid: { stringValue: uid },
          employeeId: { stringValue: LEAD },
          orgId: { stringValue: ORG },
          linkedBy: { stringValue: 'e2e' },
        },
      }),
    });
    expect(res.ok, 'seeding employee_links').toBeTruthy();
  });

  test.afterAll(async () => {
    if (uid) {
      await setStoredRole(uid, 'manager');
      await firestore(`employee_links/${uid}`, { method: 'DELETE' });
    }
    for (const [store, id] of [['employees', LEAD], ['employees', REPORT], ['expenseClaims', CLAIM_ID]]) {
      await firestore(`org_records/${ORG}__${store}__${id}`, { method: 'DELETE' });
    }
  });

  test('is undone on screen and said out loud', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill(ROLLBACK_PERSONA.email);
    await page.locator('#password').fill(ROLLBACK_PERSONA.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 20_000 });

    await page.goto('/dashboard/pending-approvals/expense-claims');
    const row = page.locator(`[data-testid="expense-approval-claim"][data-employee-id="${REPORT}"]`);
    await expect(row).toHaveCount(1, { timeout: 20_000 });

    // Revoked on the server, unseen by the page: it still offers Approve.
    await setStoredRole(uid, 'employee');
    await row.getByRole('button', { name: 'Approve' }).click();

    // The banner is the half a silent rollback cannot supply: without it the
    // row simply comes back, which reads as the app losing the change rather
    // than the server refusing it.
    await expect(page.getByTestId('save-failure-banner')).toBeVisible({ timeout: 15_000 });
    // And the claim is back to what the database holds: still undecided.
    await expect(row).toHaveCount(1, { timeout: 15_000 });

    const stored = await firestore(`org_records/${ORG}__expenseClaims__${CLAIM_ID}`);
    const body = (await stored.json()) as { fields?: { status?: { stringValue?: string } } };
    expect(body.fields?.status?.stringValue).toBe('Submitted');
  });
});
