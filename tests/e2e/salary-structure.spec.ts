import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * The salary split belongs to the organisation — including when it has not set
 * one.
 *
 * Basic 50% / HRA 25% / two flat ₹1,492 allowances were literals in
 * `buildPayslipComponents`, which made one company's compensation policy every
 * company's. They now live in `org_settings`, and an organisation that has not
 * configured a split is shown no breakdown at all rather than a plausible
 * default it never agreed to — a company reading "Basic 50%" on its own
 * payslips would take it for its own policy.
 *
 * ## Why every salary-split assertion lives in this one file
 *
 * These tests set and clear a **shared** configuration document, and everything
 * else in the deployment computes a breakdown from it. Split across two spec
 * files they would run concurrently in different workers against one emulator,
 * and each would see the other's half-applied state. One `describe.serial` in
 * one file, on one engine, is what makes "clear it, then check nothing shows" a
 * meaningful assertion — and it is why the structure is restored at the end.
 *
 * The same reasoning puts it in the org-settings project rather than the app
 * project: see SHARED_CONFIG_SPECS in playwright.config.ts.
 */
const ADMIN = PERSONAS.admin;
const STRUCTURE_DOC = 'org_settings/default__salaryStructure';

/** ModCon Builders' own split — the demo organisation's data, not a platform default. */
const DEMO = { basic: 50, hra: 25, medical: 1492, conveyance: 1492 };
const CHANGED = { basic: 40, hra: 30, medical: 2000, conveyance: 1000 };

// Two very different salaries: a flat allowance must be the same rupee figure
// on both, and a percentage one must not be.
const HIGH_EARNER = 'Aarav Sharma';
const LOWER_EARNER = 'Riya Sharma';

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
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw) as Record<string, number> | null;
}

interface Breakdown {
  monthly: number;
  components: Record<string, number>;
}

async function openCompensation(page: Page, name: string) {
  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByPlaceholder('Search name, role, email, code…').fill(name);
  await page.getByText(name).first().click();
  await page.getByRole('button', { name: 'Compensation' }).click();
  await expect(page.getByTestId('monthly-gross')).toBeVisible();
}

/** Read the compensation breakdown for one employee, in rupees. */
async function breakdownFor(page: Page, name: string): Promise<Breakdown> {
  await openCompensation(page, name);
  const monthly = Number(await page.getByTestId('monthly-gross').getAttribute('data-amount'));

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
    await setStructure(page, DEMO);
  });

  test.afterAll(async () => {
    // Everything else in the deployment computes pay from what this leaves
    // behind. Restoring is not tidiness; skipping it changes every payslip.
    try {
      await openSalaryStructure(page);
      await setStructure(page, DEMO);
    } finally {
      await page?.close();
    }
  });

  test('the demo organisation shows its own configured split', async () => {
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

  test('an incomplete form previews nothing and cannot be saved', async () => {
    await openSalaryStructure(page);
    await page.getByLabel('Medical allowance').fill('');
    await expect(page.getByTestId('salary-structure-preview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save Structure' })).toBeDisabled();
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

    const { monthly, components } = await breakdownFor(page, HIGH_EARNER);
    expect(components['Basic Salary']).toBe(Math.round(monthly * (CHANGED.basic / 100)));
    expect(components['HRA']).toBe(Math.round(monthly * (CHANGED.hra / 100)));
    expect(components['Medical Allowance']).toBe(CHANGED.medical);
    expect(components['Conveyance Allowance']).toBe(CHANGED.conveyance);
  });

  test('the change survives a reload, because it is not held in this browser', async () => {
    await page.reload();
    await openSalaryStructure(page);
    await expect(page.getByLabel('Basic percent')).toHaveValue(String(CHANGED.basic));
    await expect(page.getByLabel('Conveyance allowance')).toHaveValue(String(CHANGED.conveyance));
  });

  test('the components always add up to the monthly gross', async () => {
    // The invariant that holds under any structure: Special Allowance is the
    // remainder, so rounding Basic and HRA can never quietly lose a rupee of
    // somebody's pay.
    for (const name of [HIGH_EARNER, LOWER_EARNER]) {
      const { monthly, components } = await breakdownFor(page, name);
      expect(Object.keys(components)).toEqual([
        'Basic Salary',
        'HRA',
        'Medical Allowance',
        'Conveyance Allowance',
        'Special Allowance',
      ]);
      const others =
        components['Basic Salary'] +
        components['HRA'] +
        components['Medical Allowance'] +
        components['Conveyance Allowance'];
      expect(components['Special Allowance']).toBe(monthly - others);
      expect(Object.values(components).reduce((sum, amount) => sum + amount, 0)).toBe(monthly);
    }
  });

  test('percentage components scale with salary; flat ones do not', async () => {
    const high = await breakdownFor(page, HIGH_EARNER);
    const lower = await breakdownFor(page, LOWER_EARNER);
    expect(high.monthly).toBeGreaterThan(lower.monthly);

    const ratio = (part: number, whole: number) => part / whole;
    expect(ratio(high.components['Basic Salary'], high.monthly)).toBeCloseTo(
      ratio(lower.components['Basic Salary'], lower.monthly),
      4,
    );
    expect(high.components['Medical Allowance']).toBe(lower.components['Medical Allowance']);
    expect(high.components['Conveyance Allowance']).toBe(lower.components['Conveyance Allowance']);
  });

  test('clearing the structure hides the breakdown rather than falling back to a default', async () => {
    await openSalaryStructure(page);
    await page.getByRole('button', { name: 'Clear structure' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 20_000 });

    // Cleared at the organisation, not just blanked on screen: the published
    // value is null, so another administrator's browser hydrates to unset too.
    expect(await publishedStructure()).toBeNull();

    // The form is empty — no 50 / 25 / 1492 waiting to be saved by accident.
    await expect(page.getByLabel('Basic percent')).toHaveValue('');
    await expect(page.getByLabel('Medical allowance')).toHaveValue('');
    await expect(page.getByTestId('salary-structure-unset')).toBeVisible();

    // And no breakdown anywhere: the gross is still known, the split is not.
    await openCompensation(page, HIGH_EARNER);
    await expect(page.getByTestId('salary-structure-unset')).toBeVisible();
    await expect(page.getByTestId('salary-component')).toHaveCount(0);
    expect(
      Number(await page.getByTestId('monthly-gross').getAttribute('data-amount')),
    ).toBeGreaterThan(0);
  });

  test('setting a structure again brings the breakdown back', async () => {
    await openSalaryStructure(page);
    await setStructure(page, DEMO);

    const { monthly, components } = await breakdownFor(page, HIGH_EARNER);
    expect(components['Basic Salary']).toBe(Math.round(monthly * (DEMO.basic / 100)));
    expect(components['Medical Allowance']).toBe(DEMO.medical);
  });
});
