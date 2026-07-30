import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { type Persona } from './config';

/**
 * The organisation's leave policy, as each role actually sees it.
 *
 * Entitlement is derived from the policy and the date rather than stored (see
 * src/data/leaveEntitlements.ts), so these assertions are about the rules
 * holding rather than about a seeded number: Casual and Sick accrue monthly and
 * are never presented as an annual quota, and the year they reset in is the
 * financial year, not the calendar year.
 *
 * The accrued figure itself is deliberately not asserted — it changes every
 * month, and a test needing an edit each April is a test people delete. The
 * month-boundary arithmetic (1 April resets to 1, 31 March holds 12, mid-year
 * joiners accrue from their joining month) is exact logic covered away from the
 * browser; what matters here is that the page presents a monthly rate and a
 * financial year at all.
 *
 * Runs per persona because the balance cards only render for someone with
 * employees in scope — the employee persona has no directory record of its own,
 * so it sees the framing but no cards.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

test.describe.serial('leave policy', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    const p = persona();
    await page.goto('/login');
    await page.locator('#username').fill(p.email);
    await page.locator('#password').fill(p.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('balances are scoped to the financial year, not the calendar year', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    // April-March. A calendar-year label here would mean the reset is wrong.
    await expect(page.getByText(/FY \d{4}-\d{2}/)).toBeVisible();
    await expect(page.getByText(/do not survive 1 April/)).toBeVisible();
  });

  test('Casual and Sick carry a monthly rate, never an annual quota', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Leave Balance/ }).click();

    if (persona().role === 'employee') {
      // No directory record, so no cards — the framing is all this persona
      // can assert, and the suppression below still applies.
      await expect(page.getByText(/FY \d{4}-\d{2}/)).toBeVisible();
    } else {
      await expect(page.getByText('1/month').first()).toBeVisible();
    }

    // The suppression the policy asks for: an annual Casual/Sick figure must
    // not appear anywhere, or an employee could believe a year's leave is
    // available in April.
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/Casual \d+ days\/year/);
    expect(text).not.toMatch(/Sick \d+ days\/year/);
  });

  test('the balances survive a reload', async () => {
    await page.goto('/leave');
    await page.reload();
    await page.getByRole('button', { name: /Leave Balance/ }).click();
    await expect(page.getByText(/FY \d{4}-\d{2}/)).toBeVisible();
  });
});
