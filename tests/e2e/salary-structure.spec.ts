import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * The salary split belongs to the organisation, not to the platform.
 *
 * Basic 50% / HRA 25% / two flat ₹1,492 allowances were literals in
 * `buildPayslipComponents`, which made one company's compensation policy every
 * company's. They now live in `org_settings` like the leave policies, and this
 * spec is the acceptance test for that: change them in Settings, and the
 * payslip breakdown an employee's profile shows must change with them — for
 * this organisation.
 *
 * ## Why this is an org-settings spec rather than an app spec
 *
 * It writes the organisation's *shared* configuration document, the same class
 * of write org-settings.spec.ts documents: one document per setting, whole-file
 * writes, and running it once per browser engine would be three concurrent
 * writers on one document. It also has to put the structure back afterwards —
 * `restoreDefaults` below — because everything else in the deployment computes
 * pay from what this test leaves behind.
 */
const ADMIN = PERSONAS.admin;
const STRUCTURE_DOC = 'org_settings/default__salaryStructure';

const DEFAULTS = { basic: 50, hra: 25, medical: 1492, conveyance: 1492 };
const CHANGED = { basic: 40, hra: 30, medical: 2000, conveyance: 1000 };

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openSalaryStructure(page: Page) {
  await page.goto('/settings?tab=salary');
  await expect(page.getByRole('heading', { name: 'Salary Structure' })).toBeVisible();
}

/** Fill the four fields and save, waiting for the write to be acknowledged. */
async function setStructure(
  page: Page,
  values: { basic: number; hra: number; medical: number; conveyance: number },
) {
  await page.getByLabel('Basic percent').fill(String(values.basic));
  await page.getByLabel('HRA percent').fill(String(values.hra));
  await page.getByLabel('Medical allowance').fill(String(values.medical));
  await page.getByLabel('Conveyance allowance').fill(String(values.conveyance));
  await page.getByRole('button', { name: 'Save Structure' }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 20_000 });
}

/** What the organisation's Firestore copy actually holds, not what the page shows. */
async function publishedStructure(): Promise<Record<string, number> | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${STRUCTURE_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  return typeof raw === 'string' ? (JSON.parse(raw) as Record<string, number>) : null;
}

/** Read the compensation breakdown for one employee, in rupees. */
async function breakdownFor(page: Page, name: string) {
  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByText(name).first().click();
  await page.getByRole('button', { name: 'Compensation' }).click();

  const gross = page.getByTestId('monthly-gross');
  await expect(gross).toBeVisible();
  const monthly = Number(await gross.getAttribute('data-amount'));

  const rows = page.getByTestId('salary-component');
  await expect(rows.first()).toBeVisible();
  const components = Object.fromEntries(
    (await rows.evaluateAll((nodes) =>
      nodes.map((node) => [
        node.getAttribute('data-component') ?? '',
        Number(node.getAttribute('data-amount')),
      ]),
    )) as Array<[string, number]>,
  );
  return { monthly, components };
}

test.describe.serial('the salary structure belongs to the organisation', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
    // Start from a known structure rather than whatever a previous run left,
    // so the assertions below are about this test's own changes.
    await openSalaryStructure(page);
    await setStructure(page, DEFAULTS);
  });

  test.afterAll(async () => {
    // Everything else in the deployment computes pay from what this leaves
    // behind. Restoring is not tidiness; skipping it changes every payslip.
    try {
      await openSalaryStructure(page);
      await setStructure(page, DEFAULTS);
    } finally {
      await page?.close();
    }
  });

  test('the defaults are the split every organisation starts on', async () => {
    await openSalaryStructure(page);
    await expect(page.getByLabel('Basic percent')).toHaveValue('50');
    await expect(page.getByLabel('HRA percent')).toHaveValue('25');
    await expect(page.getByLabel('Medical allowance')).toHaveValue('1492');
    await expect(page.getByLabel('Conveyance allowance')).toHaveValue('1492');
  });

  test('the preview shows what the components would become', async () => {
    await openSalaryStructure(page);
    await page.getByLabel('Basic percent').fill(String(CHANGED.basic));
    await page.getByLabel('HRA percent').fill(String(CHANGED.hra));
    await page.getByLabel('Medical allowance').fill(String(CHANGED.medical));
    await page.getByLabel('Conveyance allowance').fill(String(CHANGED.conveyance));

    // ₹1,00,000 example gross: 40,000 + 30,000 + 2,000 + 1,000, remainder 27,000.
    const preview = page.getByTestId('salary-structure-preview');
    await expect(preview).toContainText('₹40,000');
    await expect(preview).toContainText('₹30,000');
    await expect(preview).toContainText('₹2,000');
    await expect(preview).toContainText('₹1,000');
    await expect(preview).toContainText('₹27,000');
  });

  test('percentages that overspend the gross are refused', async () => {
    await openSalaryStructure(page);
    await page.getByLabel('Basic percent').fill('80');
    await page.getByLabel('HRA percent').fill('40');
    await expect(page.getByRole('alert')).toContainText('cannot exceed 100%');
    await expect(page.getByRole('button', { name: 'Save Structure' })).toBeDisabled();
  });

  test('a saved change reaches the organisation and the breakdown follows it', async () => {
    await openSalaryStructure(page);
    await setStructure(page, CHANGED);

    const published = await publishedStructure();
    expect(published, 'the structure never reached the organisation').not.toBeNull();
    expect(published).toMatchObject({
      basicPercent: CHANGED.basic,
      hraPercent: CHANGED.hra,
      medicalAllowance: CHANGED.medical,
      conveyanceAllowance: CHANGED.conveyance,
    });

    const { monthly, components } = await breakdownFor(page, 'Aarav Sharma');
    expect(components['Basic Salary']).toBe(Math.round(monthly * (CHANGED.basic / 100)));
    expect(components['HRA']).toBe(Math.round(monthly * (CHANGED.hra / 100)));
    expect(components['Medical Allowance']).toBe(CHANGED.medical);
    expect(components['Conveyance Allowance']).toBe(CHANGED.conveyance);
    // Still exact: Special Allowance absorbs whatever the rounding leaves.
    expect(Object.values(components).reduce((sum, amount) => sum + amount, 0)).toBe(monthly);
  });

  test('the change survives a reload, because it is not held in this browser', async () => {
    await page.reload();
    await openSalaryStructure(page);
    await expect(page.getByLabel('Basic percent')).toHaveValue(String(CHANGED.basic));
    await expect(page.getByLabel('Conveyance allowance')).toHaveValue(String(CHANGED.conveyance));
  });
});
