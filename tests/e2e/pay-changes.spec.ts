import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken, listOrgRecords, seedOrgRecords } from './firestore';

/**
 * A raise, a tax declaration and an exit, recorded on somebody's profile.
 *
 * The arithmetic — proration, arrears, the settlement — is unit-tested in
 * tests/unit/payChanges.test.ts. What only a browser can show is that HR can
 * reach these from the Compensation tab and that each lands on the
 * organisation's copy of the record, which is what payroll reads.
 *
 * In the org-settings project because it writes the shared directory (and a
 * tax election into shared configuration). The person is this run's own, so
 * nothing here touches anybody another spec reads.
 */

const RUN = Date.now().toString(36);
const PERSON = {
  id: `emp-e2e-pay-${RUN}`,
  employeeCode: `E2E-PAY-${RUN}`,
  firstName: 'Paychange',
  lastName: 'E2E',
  fullName: 'Paychange E2E',
  email: `pay-changes-${RUN}@example.com`,
  phone: '',
  avatar: 'brand',
  dateOfBirth: '1990-01-01',
  designation: 'Engineer',
  department: 'Engineering',
  location: 'Bengaluru',
  employmentType: 'Full-time',
  status: 'Active',
  dateOfJoining: '2019-04-01',
  reportingManagerId: null,
  ctc: 600000,
};

interface Stored {
  id: string;
  ctc: number;
  status: string;
  lastWorkingDay?: string;
  salaryHistory?: { ctc: number; previousCtc: number; effectiveFrom: string }[];
  finalSettlement?: { net: number };
}

async function stored(): Promise<Stored | undefined> {
  return (await listOrgRecords<Stored>('employees')).find((e) => e.id === PERSON.id);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONAS.admin.email);
  await page.locator('#password').fill(PERSONAS.admin.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

test.describe.serial('pay changes on a profile', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    await seedOrgRecords('employees', [PERSON], { employeeId: (r) => r.id });
    page = await browser.newPage();
    await login(page);
    await page.goto(`/employees/${PERSON.id}`);
    await page.getByRole('button', { name: /^Compensation/ }).first().click();
  });

  test.afterAll(async () => {
    const token = await adminToken();
    await fetch(`${FIRESTORE_BASE}/org_records/default__employees__${PERSON.id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    await page?.close();
  });

  test('a raise is recorded with its date, and the old figure kept', async () => {
    await page.getByRole('button', { name: 'Revise salary' }).click();
    const dialog = page.getByRole('dialog', { name: 'Revise salary' });
    await dialog.getByLabel('New annual CTC (₹)').fill('720000');
    await dialog.getByLabel('Effective from').fill('2026-04-01');
    await dialog.getByLabel('Reason (optional)').fill('Annual increment');
    await dialog.getByRole('button', { name: 'Save revision' }).click();
    await expect(page.getByTestId('salary-history')).toContainText('Annual increment');

    await expect.poll(async () => (await stored())?.ctc, { timeout: 15_000 }).toBe(720000);
    expect((await stored())?.salaryHistory).toEqual([
      expect.objectContaining({ ctc: 720000, previousCtc: 600000, effectiveFrom: '2026-04-01' }),
    ]);
  });

  test('an exit sets the last working day, and the settlement can be confirmed', async () => {
    await page.getByRole('button', { name: 'Record exit' }).click();
    const exit = page.getByRole('dialog', { name: 'Record exit' });
    await exit.getByLabel('Last working day').fill('2030-01-15');
    await exit.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await stored())?.lastWorkingDay, { timeout: 15_000 }).toBe('2030-01-15');
    expect((await stored())?.status).toBe('Notice Period');

    await page.getByRole('button', { name: 'Full & final settlement' }).click();
    const settle = page.getByRole('dialog', { name: 'Full & final settlement' });
    await expect(settle.getByTestId('settlement-statement')).toContainText('Gratuity');
    await settle.getByRole('button', { name: 'Confirm settlement' }).click();
    await expect.poll(async () => typeof (await stored())?.finalSettlement?.net, { timeout: 15_000 }).toBe('number');
    await expect(page.getByText(/Settlement confirmed/)).toBeVisible();
  });
});
