import { test, expect, type Page } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD } from './config';

/**
 * End-to-end smoke test.
 *
 * Signs in through the real UI against Firebase Auth, then walks every module
 * in the sidebar asserting the page renders (heading visible, no crash) and no
 * uncaught runtime errors are thrown.
 */

const MODULES: { label: string; path: string; heading: RegExp }[] = [
  { label: 'Dashboard', path: '/', heading: /dashboard|welcome|overview/i },
  { label: 'Employees', path: '/employees', heading: /employee/i },
  { label: 'Attendance', path: '/attendance', heading: /attendance/i },
  { label: 'Leave', path: '/leave', heading: /leave/i },
  { label: 'Payroll', path: '/payroll', heading: /payroll/i },
  { label: 'Recruitment', path: '/recruitment', heading: /recruit/i },
  { label: 'Onboarding', path: '/onboarding', heading: /onboard/i },
  { label: 'Performance', path: '/performance', heading: /performance/i },
  { label: 'Expenses', path: '/expenses', heading: /expense/i },
  { label: 'Assets', path: '/assets', heading: /asset/i },
  { label: 'Helpdesk', path: '/helpdesk', heading: /helpdesk|ticket/i },
  { label: 'Reports', path: '/reports', heading: /report|analytic/i },
  { label: 'Settings', path: '/settings', heading: /setting/i },
];

const runtimeErrors: string[] = [];

function trackErrors(page: Page) {
  page.on('pageerror', (err) => runtimeErrors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Firebase analytics / measurement can warn in sandboxed environments;
      // ignore benign network noise but capture real app errors.
      if (/favicon|net::ERR|Failed to load resource/i.test(text)) return;
      runtimeErrors.push(`[console.error] ${text}`);
    }
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(TEST_EMAIL);
  await page.locator('#password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Successful auth redirects to the dashboard shell (sidebar visible).
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('ModCon HR — production smoke', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    trackErrors(page);
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  for (const mod of MODULES) {
    test(`module: ${mod.label}`, async () => {
      await page.getByRole('link', { name: mod.label, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(mod.path === '/' ? '/$' : mod.path));
      // A heading proves the module rendered rather than crashing to a blank
      // screen or the 404 page.
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page.getByText('Page not found', { exact: false })).toHaveCount(0);
    });
  }

  test('employee detail: open first profile', async () => {
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await expect(page).toHaveURL(/employees$/);
    // Switch to list view and click the first (clickable) table row.
    await page.locator('button[title="List view"]').click();
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page).toHaveURL(/employees\/.+/);
    await expect(page.getByRole('heading').first()).toBeVisible();
    // Back to the directory to leave state clean for the error-check test.
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await expect(page).toHaveURL(/employees$/);
  });

  test('no uncaught runtime errors during walkthrough', async () => {
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  });
});
