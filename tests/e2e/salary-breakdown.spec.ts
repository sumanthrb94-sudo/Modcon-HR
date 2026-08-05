import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * The monthly salary breakdown, as the organisation defines it.
 *
 * Basic 50% and HRA 25% of the monthly gross, Medical and Conveyance
 * Allowance a flat ₹1,492 each, and Special Allowance whatever is left. The
 * last of those is the part worth a test: it is a remainder, so it absorbs the
 * rupee or two that rounding Basic and HRA leaves behind, and the only way to
 * know the split is still honest is that the components add back up to the
 * monthly gross exactly. A percentage typed into two places — this tab and
 * buildPayslipComponents — is what the assertions here exist to catch.
 */
const ADMIN = PERSONAS.admin;
const FLAT_ALLOWANCE = 1492;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('monthly salary breakdown', () => {
  let page: Page;
  let monthly = 0;
  let components: Record<string, number> = {};

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);

    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByText('Aarav Sharma').first().click();
    await page.getByRole('button', { name: 'Compensation' }).click();

    const gross = page.getByTestId('monthly-gross');
    await expect(gross).toBeVisible();
    monthly = Number(await gross.getAttribute('data-amount'));

    const rows = page.getByTestId('salary-component');
    await expect(rows.first()).toBeVisible();
    components = Object.fromEntries(
      (
        await rows.evaluateAll((nodes) =>
          nodes.map((node) => [
            node.getAttribute('data-component') ?? '',
            Number(node.getAttribute('data-amount')),
          ]),
        )
      ) as Array<[string, number]>,
    );
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('the five components are listed', async () => {
    expect(Object.keys(components)).toEqual([
      'Basic Salary',
      'HRA',
      'Medical Allowance',
      'Conveyance Allowance',
      'Special Allowance',
    ]);
    expect(monthly).toBeGreaterThan(0);
  });

  test('Basic is half the monthly gross and HRA a quarter', async () => {
    expect(components['Basic Salary']).toBe(Math.round(monthly * 0.5));
    expect(components['HRA']).toBe(Math.round(monthly * 0.25));
  });

  test('Medical and Conveyance Allowance are flat amounts', async () => {
    expect(components['Medical Allowance']).toBe(FLAT_ALLOWANCE);
    expect(components['Conveyance Allowance']).toBe(FLAT_ALLOWANCE);
  });

  test('Special Allowance is exactly the remainder', async () => {
    const others =
      components['Basic Salary'] +
      components['HRA'] +
      components['Medical Allowance'] +
      components['Conveyance Allowance'];
    expect(components['Special Allowance']).toBe(monthly - others);
  });

  test('the components add up to the monthly gross', async () => {
    // The invariant the other four tests are specific cases of: whatever the
    // ratios become, the breakdown must still describe the whole salary.
    const total = Object.values(components).reduce((sum, amount) => sum + amount, 0);
    expect(total).toBe(monthly);
  });
});
