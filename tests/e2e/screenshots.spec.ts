/**
 * Screenshots of the surfaces this branch changed, taken from the running app.
 *
 * Not a test of anything — it asserts only enough to know the page it is
 * photographing actually loaded, so a broken screen produces a failure rather
 * than a picture of an error boundary. It runs in its own project
 * (`--project=screenshots`) and is excluded from the app and role specs, so an
 * ordinary E2E run neither takes these nor waits for them.
 *
 * Output: `screenshots/`, one PNG per surface.
 */
import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

const PERSONA = PERSONAS.admin;
const OUT = 'screenshots';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Let the page settle before the shutter.
 *
 * The dashboards animate in (`animate-fade-in`) and several read Firestore, so
 * a screenshot taken the instant a route resolves catches half-opacity cards.
 *
 * Deliberately *not* `waitForLoadState('networkidle')`: the app holds Firestore
 * `onSnapshot` listeners open for org settings, features and the subscription,
 * so the network is never idle and that wait simply runs out the test timeout.
 * A fixed pause is the honest tool for "wait for a CSS transition".
 */
async function settle(page: Page) {
  await page.waitForTimeout(900);
}

test.describe.configure({ mode: 'serial' });

test.describe('screenshots', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('billing — one organisation, one price', async () => {
    await page.goto('/settings?tab=billing');
    // The plan card is the thing being photographed; if it has not rendered
    // there is nothing worth a picture.
    // The plan name appears on the sidebar billing card too, so match the
    // panel's own copy rather than the name alone.
    await expect(page.getByText('per month, excl. GST')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('₹5,000 per month per organisation.')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/01-billing-subscription.png`, fullPage: true });
  });

  test('leave — requests, scoped to the viewer', async () => {
    await page.goto('/leave');
    await expect(page.getByRole('heading', { name: /Leave/i }).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/02-leave-requests.png`, fullPage: true });
  });

  test('leave — balances, from the entitlement engine', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Balances/i }).first().click();
    await expect(page.getByText(/Casual|Sick|Earned/).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/03-leave-balances.png`, fullPage: true });
  });

  test('leave — applying, with the working-day count', async () => {
    await page.goto('/leave');
    await page.getByRole('button', { name: /Apply Leave/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/04-leave-apply.png` });
    await page.keyboard.press('Escape');
  });

  test('approvals — the leave queue', async () => {
    await page.goto('/dashboard/pending-approvals/leave-requests');
    await expect(page.getByText(/Pending Leave Approval Queue/i)).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/05-approvals-leave-queue.png`, fullPage: true });
  });

  test('attendance — the week, including today', async () => {
    await page.goto('/attendance');
    await expect(page.getByRole('heading', { name: /Attendance/i }).first()).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/06-attendance-week.png`, fullPage: true });
  });

  test('dashboard', async () => {
    await page.goto('/');
    // Every route is React.lazy behind one <Suspense>, so without waiting for
    // real content the shutter catches the PageLoader spinner — which is what
    // the first run of this file produced.
    // Not "My Leave Balance" — that card renders only for an account matched to
    // an employee record, which the admin persona is not.
    await expect(page.getByText('Headcount Growth')).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/07-dashboard.png`, fullPage: true });
  });
});
