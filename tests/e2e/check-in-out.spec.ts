import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Check in, check out, and what the captured times then drive.
 *
 * The point of these operations is that the time is *captured*, not typed: an
 * administrator entering "09:00" into a form is an assertion, a check-in is
 * evidence. So the assertions are about what the stamp causes — the status it
 * derives, the hours it settles, and the regularization it raises when the
 * arrival is late — rather than about the button working.
 *
 * The page clock is fixed so all three arrival times are actually exercised.
 * Left on the wall clock, whichever side of the threshold the suite happened to
 * run on would be the only branch ever tested: a run at 15:51 IST proves the
 * late path and silently skips the on-time one.
 */
const PERSONA = PERSONAS.admin;

/** Matches the LATE_AFTER constant the app derives lateness from. */
const LATE_AFTER = '09:15';

/**
 * A fixed instant at `HH:mm` IST on today's date.
 *
 * Built from today rather than a pinned date so the suite does not quietly
 * start simulating a day in the past. IST is UTC+5:30 year-round.
 */
function istToday(time: string): Date {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${date}T${time}:00+05:30`);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** Clear stored records so each arrival scenario starts un-checked-in. */
async function resetAttendance(page: Page) {
  await page.goto('/my-attendance');
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => /attendance|regulariz/i.test(key))
      .forEach((key) => localStorage.removeItem(key));
  });
}

const clockCard = (page: Page) => page.locator('div').filter({ hasText: /^Today · / }).last();

/** The check-in time the card is showing, as `HH:mm`. */
async function stampedCheckIn(page: Page): Promise<string> {
  const text = await clockCard(page).innerText();
  return text.match(/In (\d{2}:\d{2})/)![1];
}

test.describe.serial('check in and check out', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Sign in on the real clock: fixing it first risks Firebase rejecting the
    // token for an expiry that has not happened yet.
    await login(page);
    await page.clock.install();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('nothing is stamped, and there is nothing to check out of', async () => {
    await page.clock.setFixedTime(istToday('08:55'));
    await resetAttendance(page);
    await page.goto('/my-attendance');

    await expect(page.getByText('Not checked in yet today.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check Out' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Check In' })).toBeEnabled();
  });

  test('an early arrival is Present and not late', async () => {
    await page.getByRole('button', { name: 'Check In' }).click();

    const card = clockCard(page);
    // The captured stamp is the fixed clock, to the minute.
    await expect(card).toContainText('In 08:55');
    await expect(card).toContainText('still working');
    await expect(card.getByText('Present', { exact: true })).toBeVisible();
    // 08:55 is before the threshold, so nothing to excuse.
    expect('08:55' < LATE_AFTER).toBe(true);
    await expect(card.getByText('Late', { exact: true })).toHaveCount(0);

    // Re-stamping would erase the arrival that actually happened.
    await expect(page.getByRole('button', { name: 'Check In' })).toBeDisabled();
  });

  test('the stamp survives a reload', async () => {
    await page.reload();
    await expect(clockCard(page)).toContainText('In 08:55');
    await expect(page.getByRole('button', { name: 'Check In' })).toBeDisabled();
  });

  test('checking out measures the hours between the two instants', async () => {
    // Advance the clock to a full working day later, then close it out.
    await page.clock.setFixedTime(istToday('17:25'));
    await page.getByRole('button', { name: 'Check Out' }).click();

    const card = clockCard(page);
    await expect(card).toContainText('Out 17:25');
    await expect(card).not.toContainText('still working');
    // 08:55 → 17:25 is 8.5h, measured rather than stated.
    await expect(card).toContainText('8.50h');

    await expect(page.getByRole('button', { name: 'Check Out' })).toBeDisabled();
  });

  test('an on-time arrival exactly on the threshold is not late', async () => {
    await page.clock.setFixedTime(istToday(LATE_AFTER));
    await resetAttendance(page);
    await page.goto('/my-attendance');
    await page.getByRole('button', { name: 'Check In' }).click();

    const card = clockCard(page);
    await expect(card).toContainText(`In ${LATE_AFTER}`);
    // The boundary belongs to on-time: the rule is "after 09:15", not "from".
    await expect(card.getByText('Late', { exact: true })).toHaveCount(0);
  });

  test('an on-time arrival raises no regularization', async () => {
    await page.goto('/attendance');
    const queue = page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Requested' }) });
    await expect(
      queue.locator('tbody tr').filter({ hasText: `Checked in at ${LATE_AFTER}` }),
    ).toHaveCount(0);
  });

  test('a late arrival is flagged, and reaches the regularization queue', async () => {
    await page.clock.setFixedTime(istToday('09:47'));
    await resetAttendance(page);
    await page.goto('/my-attendance');
    await page.getByRole('button', { name: 'Check In' }).click();

    const card = clockCard(page);
    await expect(card).toContainText('In 09:47');
    await expect(card.getByText('Late', { exact: true })).toBeVisible();
    expect(await stampedCheckIn(page)).toBe('09:47');

    // The stamp flows straight into the approval queue with no separate step,
    // and the reason quotes the captured time.
    await page.goto('/attendance');
    const queue = page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Requested' }) });
    const flagged = queue.locator('tbody tr').filter({ hasText: 'Checked in at 09:47' });
    await expect(flagged.first()).toBeVisible();
    // Derived from the record, so nobody requested a status on it.
    await expect(flagged.first().locator('td').nth(3)).toContainText('—');
  });

  test('a manager can approve the day the late stamp raised', async () => {
    const queue = page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Requested' }) });
    const flagged = queue.locator('tbody tr').filter({ hasText: 'Checked in at 09:47' }).first();

    await flagged.getByRole('button', { name: 'Approve' }).click();
    await expect(flagged).toContainText('Approved');

    // No requested status, so the decision is recorded and the day is left as
    // it was recorded — approving cannot invent what it should become.
    await expect(flagged.locator('td').nth(2)).toContainText('Present');
  });
});
