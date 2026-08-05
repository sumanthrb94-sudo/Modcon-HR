import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * The monthly salary breakdown, whatever the organisation has configured.
 *
 * The percentages and the flat amounts are the organisation's own setting now
 * (Settings → Salary Structure, `src/data/salaryStructure.ts`), so asserting
 * "Basic is 50%" here would be asserting a value another spec is entitled to
 * change — and does. What holds under *any* structure is asserted instead:
 *
 *   - the five components are all shown;
 *   - Special Allowance is exactly the remainder, so the components sum to the
 *     monthly gross — the invariant that keeps rounding from quietly losing a
 *     rupee or two of somebody's pay;
 *   - the percentage components scale with salary and the flat ones do not,
 *     which is the whole distinction between the two kinds.
 *
 * The configured values themselves are covered in salary-structure.spec.ts,
 * which owns that setting and can set and restore it deterministically.
 */
const ADMIN = PERSONAS.admin;
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

interface Breakdown {
  monthly: number;
  components: Record<string, number>;
}

async function breakdownFor(page: Page, name: string): Promise<Breakdown> {
  await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
  await page.getByPlaceholder('Search name, role, email, code…').fill(name);
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

test.describe.serial('monthly salary breakdown', () => {
  let page: Page;
  let high: Breakdown;
  let lower: Breakdown;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
    high = await breakdownFor(page, HIGH_EARNER);
    lower = await breakdownFor(page, LOWER_EARNER);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('the five components are listed', async () => {
    expect(Object.keys(high.components)).toEqual([
      'Basic Salary',
      'HRA',
      'Medical Allowance',
      'Conveyance Allowance',
      'Special Allowance',
    ]);
    expect(high.monthly).toBeGreaterThan(lower.monthly);
  });

  test('Special Allowance is exactly the remainder', async () => {
    for (const { monthly, components } of [high, lower]) {
      const others =
        components['Basic Salary'] +
        components['HRA'] +
        components['Medical Allowance'] +
        components['Conveyance Allowance'];
      expect(components['Special Allowance']).toBe(monthly - others);
    }
  });

  test('the components add up to the monthly gross', async () => {
    for (const { monthly, components } of [high, lower]) {
      const total = Object.values(components).reduce((sum, amount) => sum + amount, 0);
      expect(total).toBe(monthly);
    }
  });

  test('Basic and HRA scale with salary; Medical and Conveyance do not', async () => {
    // The same share of two different salaries, to within the rupee that
    // rounding each one costs.
    const ratio = (part: number, whole: number) => part / whole;
    expect(ratio(high.components['Basic Salary'], high.monthly)).toBeCloseTo(
      ratio(lower.components['Basic Salary'], lower.monthly),
      4,
    );
    expect(ratio(high.components['HRA'], high.monthly)).toBeCloseTo(
      ratio(lower.components['HRA'], lower.monthly),
      4,
    );

    expect(high.components['Medical Allowance']).toBe(lower.components['Medical Allowance']);
    expect(high.components['Conveyance Allowance']).toBe(lower.components['Conveyance Allowance']);
  });
});
