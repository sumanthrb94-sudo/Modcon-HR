import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken, seedOrgRecords } from './firestore';

/**
 * Employees → Create logins gives many people accounts in one go.
 *
 * After importing a team, HR used to open every profile and press Create
 * login on each. This seeds three people — two with addresses of their own
 * and one with none — and drives the bulk dialog: the two get accounts and
 * their records are linked (`employee_links`, the one answer to who an
 * account is), and the third is named as unable to have a login rather than
 * silently left out.
 *
 * In the org-settings project because it writes the organisation's shared
 * directory and creates Auth accounts — emulator-only, like the rest of it.
 * The single Create login button on a profile is untouched and covered by the
 * provisioning specs.
 */

const RUN = Date.now().toString(36);
const person = (n: number, email: string) => ({
  id: `emp-e2e-bulk-${RUN}-${n}`,
  employeeCode: `E2E-BULK-${RUN}-${n}`,
  firstName: `Bulk${n}`,
  lastName: 'Login E2E',
  fullName: `Bulk${n} Login E2E`,
  email,
  phone: '',
  avatar: 'brand',
  dateOfBirth: '1990-01-01',
  designation: 'Engineer',
  department: 'Engineering',
  location: 'Bengaluru',
  employmentType: 'Full-time',
  status: 'Active',
  dateOfJoining: '2024-01-01',
  reportingManagerId: null,
  ctc: 600000,
});
const PEOPLE = [
  person(1, `bulk-login-1-${RUN}@example.com`),
  person(2, `bulk-login-2-${RUN}@example.com`),
  person(3, ''),
];

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONAS.admin.email);
  await page.locator('#password').fill(PERSONAS.admin.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

/** Whether an account is linked to this employee record, read from Firestore. */
async function linkedTo(employeeId: string): Promise<boolean> {
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'employee_links' }],
        where: { fieldFilter: { field: { fieldPath: 'employeeId' }, op: 'EQUAL', value: { stringValue: employeeId } } },
      },
    }),
  });
  const rows = (await res.json()) as Array<{ document?: unknown }>;
  return rows.some((row) => row.document);
}

test.describe.serial('bulk logins', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await seedOrgRecords('employees', PEOPLE, { employeeId: (r) => r.id });
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    const token = await adminToken();
    await Promise.all(PEOPLE.map((p) => fetch(`${FIRESTORE_BASE}/org_records/default__employees__${p.id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })));
    await page?.close();
  });

  test('HR picks people and creates their logins in one go', async () => {
    await page.goto('/employees');
    await page.getByRole('button', { name: 'Create logins' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create logins' });
    await expect(dialog.getByText('Bulk1 Login E2E')).toBeVisible({ timeout: 20_000 });

    // Somebody with no email is named, not offered.
    await expect(dialog).toContainText('cannot have a login without an email address');
    await expect(dialog).toContainText('Bulk3 Login E2E');
    await expect(dialog.getByLabel('Include Bulk3 Login E2E')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Select none' }).click();
    await dialog.getByLabel('Include Bulk1 Login E2E').check();
    await dialog.getByLabel('Include Bulk2 Login E2E').check();
    await dialog.getByLabel('Role for Bulk2 Login E2E').selectOption('manager');
    await dialog.getByRole('button', { name: 'Create 2 logins' }).click();

    await expect(dialog.getByTestId('bulk-login-row')).toHaveCount(2);
    await expect(dialog.getByText(/^Created/)).toHaveCount(2, { timeout: 30_000 });

    await expect.poll(() => linkedTo(PEOPLE[0].id), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => linkedTo(PEOPLE[1].id), { timeout: 15_000 }).toBe(true);
  });

  test('the next time, they are counted as already having a login', async () => {
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Create logins' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create logins' });
    await expect(dialog.getByText(/already (has a login|have logins)/)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByLabel('Include Bulk1 Login E2E')).toHaveCount(0);
    await expect(dialog.getByLabel('Include Bulk2 Login E2E')).toHaveCount(0);
  });
});
