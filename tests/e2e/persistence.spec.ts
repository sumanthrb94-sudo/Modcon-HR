import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { waitForOrgRecordsQuiet } from './firestore';

/**
 * Data written through the UI must still be there after a refresh.
 *
 * Several modules — attendance, assets, expenses, helpdesk, payroll — held
 * their records in React state seeded from a static array, so everything a user
 * did to them survived only until the next reload. That is indistinguishable
 * from the app losing their work, and nothing caught it: the other specs never
 * reload the page, so in-memory state passes them exactly as persisted state
 * would.
 *
 * Each test below therefore does the same three things: create something with a
 * unique name, reload, and assert it is still listed. The reload is the whole
 * point — an assertion made without one proves nothing about persistence.
 */
const PERSONA = PERSONAS.admin;

// Unique per run so a re-run never passes on the previous run's leftovers.
const stamp = `${Date.now().toString(36)}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('data survives a refresh', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a raised helpdesk ticket is still there after reload', async () => {
    const subject = `Persistence check ${stamp}`;

    await page.getByRole('link', { name: 'Helpdesk', exact: true }).first().click();
    await page.getByRole('button', { name: 'Raise Ticket' }).first().click();
    await page.getByPlaceholder('Briefly describe your issue…').fill(subject);
    // The modal's own submit, not the page-level button that opened it.
    await page.getByRole('dialog').getByRole('button', { name: 'Submit Ticket' }).click();
    // Submitting opens the new ticket's detail dialog; dismiss it so the
    // assertion below is about the list, not the dialog that is still open.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('table').getByText(subject)).toBeVisible();

    // The write is optimistic — the click returned before its commit — and a
    // reload is a fresh Firestore SDK with an empty mutation queue, so an
    // un-acked write is discarded and the subscription hydrates the cache from
    // the server's older copy. Wait for the server, then reload. This is what
    // the assertion is about, so racing it proves nothing either way.
    await waitForOrgRecordsQuiet('tickets');
    await page.reload();
    await expect(page.getByRole('table').getByText(subject)).toBeVisible();
  });

  test('an added asset is still there after reload', async () => {
    const assetName = `Persistence Asset ${stamp}`;

    await page.getByRole('link', { name: 'Assets', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add Asset' }).first().click();
    const addDialog = page.getByRole('dialog');
    await addDialog.getByPlaceholder('e.g. MacBook Pro 14').fill(assetName);
    await addDialog.getByPlaceholder('e.g. SN-2026-0001').fill(`SN-${stamp}`);
    await addDialog.getByPlaceholder('e.g. 85000').fill('12345');
    // Category is required; the form refuses to save without it.
    const categorySelect = addDialog.locator('select').first();
    await categorySelect.selectOption(
      (await categorySelect.locator('option').nth(1).getAttribute('value')) as string,
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Add Asset' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('table').getByText(assetName)).toBeVisible();

    await waitForOrgRecordsQuiet('assets');
    await page.reload();
    await expect(page.getByRole('table').getByText(assetName)).toBeVisible();
  });

  test('marked attendance is still there after reload', async () => {
    await page.getByRole('link', { name: 'Attendance', exact: true }).first().click();
    await page.getByRole('button', { name: /Mark Attendance/i }).first().click();

    const dialog = page.getByRole('dialog');
    // Pick whoever the scope offers rather than pinning an employee id — the
    // list is filtered by who this viewer may see.
    const employeeSelect = dialog.locator('select').first();
    const value = await employeeSelect.locator('option').nth(1).getAttribute('value');
    await employeeSelect.selectOption(value as string);
    await dialog.getByRole('button', { name: 'Save' }).click();

    // Today's column now holds a record for that person; the count of marked
    // rows is what must survive, so capture it and compare after the reload.
    const before = await page.locator('table tbody tr').count();
    expect(before).toBeGreaterThan(0);

    await waitForOrgRecordsQuiet('attendanceRecords');
    await page.reload();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    expect(await page.locator('table tbody tr').count()).toBe(before);
  });
});

/**
 * A change made on one page has to show up wherever else that record is
 * counted.
 *
 * The consolidated approval queue derives its figures from
 * `pendingApprovalsSummary()`, which read the static seed arrays rather than
 * the stores. So deciding a regularization or completing an onboarding task
 * changed the page you were on and nothing else: this queue kept reporting the
 * number it started with.
 *
 * These assertions deliberately compare a count on a *different* page after
 * acting — asserting on the page that performed the action would pass whether
 * or not the aggregate readers were fixed.
 */
async function pendingCountFor(page: Page, queue: string): Promise<number> {
  await page.goto('/dashboard/pending-approvals');
  const row = page.locator('a', { hasText: queue }).first();
  await expect(row).toBeVisible();

  // Read until the figure stops moving. These stores hydrate from Firestore
  // *after* the page renders, so the first number shown is the cache's and the
  // subscription can still raise it a moment later. Captured on the way past,
  // the `before` and `after` of this test straddle that hydration and the
  // difference between them is not the decision it is supposed to be measuring.
  const countNow = async () => {
    const text = (await row.innerText()).replace(/\s+/g, ' ');
    return Number(text.match(/(\d+) pending items/)?.[1] ?? -1);
  };
  let previous = await countNow();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(300);
    const current = await countNow();
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

test.describe.serial('changes reflect on related pages', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('deciding a regularization updates the consolidated approval queue', async () => {
    const before = await pendingCountFor(page, 'Regularizations');
    test.skip(before <= 0, 'no pending regularizations in this dataset');

    await page.getByRole('link', { name: 'Attendance', exact: true }).first().click();
    await page.getByRole('button', { name: /^Approve$/ }).first().click();

    // `pendingCountFor` navigates, which reloads the app and therefore the
    // Firestore SDK. The decision has to be on the server first or it is
    // thrown away with the page that made it.
    await waitForOrgRecordsQuiet('regularizationOverrides');
    expect(await pendingCountFor(page, 'Regularizations')).toBe(before - 1);
  });


});
