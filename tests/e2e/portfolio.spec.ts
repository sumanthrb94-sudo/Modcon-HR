/**
 * The five screens PORTFOLIO.md shows, captured from the running application.
 *
 * Separate from screenshots.spec.ts, which photographs whatever a branch
 * changed and will keep changing. These five are the product's own story —
 * dashboard, people, attendance, leave, billing — so they are pinned here and
 * regenerated deliberately rather than drifting whenever a fix is made
 * somewhere else.
 *
 * One viewport for all five, because a portfolio page with screenshots at
 * different widths looks like a collage rather than a product.
 *
 * Regenerate with `--project=screenshots`; output goes to `screenshots/portfolio/`.
 */
import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

const PERSONA = PERSONAS.admin;
const OUT = 'screenshots/portfolio';
const VIEWPORT = { width: 1600, height: 1000 };

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Wait for the fade-in, not for the network.
 *
 * `networkidle` never arrives — the app keeps Firestore `onSnapshot` listeners
 * open — so waiting on it only burns the test timeout. Each capture below
 * additionally asserts on real content, so a screenshot is never taken of the
 * lazy-route spinner.
 */
async function settle(page: Page) {
  await page.waitForTimeout(1000);
}

test.describe.configure({ mode: 'serial' });

test.describe('portfolio', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: VIEWPORT });
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('01 dashboard', async () => {
    await page.goto('/');
    await expect(page.getByText('Headcount Growth')).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });
  });

  test('02 employees', async () => {
    await page.goto('/employees');
    await expect(page.getByRole('heading', { name: /Employees/i }).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/02-employees.png`, fullPage: true });
  });

  test('03 attendance', async () => {
    await page.goto('/attendance');
    await expect(page.getByRole('heading', { name: /Attendance/i }).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/03-attendance.png`, fullPage: true });
  });

  test('04 leave', async () => {
    await page.goto('/leave');
    await expect(page.getByRole('heading', { name: /Leave/i }).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/04-leave.png`, fullPage: true });
  });

  test('05 billing', async () => {
    await page.goto('/settings?tab=billing');
    await expect(page.getByText('per month, excl. GST')).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/05-billing.png`, fullPage: true });
  });
});
