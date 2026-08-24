import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { istDay, istToday } from './clock';

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

/**
 * The demo organisation's General shift starts at 09:00 with a 15-minute
 * grace, so this is the time it stops being on time. It was a `LATE_AFTER`
 * platform constant until shift timings became the organisation's own —
 * see src/data/shifts.ts.
 */
const LATE_AFTER = '09:15';

// The clock is anchored on a working day rather than on the wall-clock date —
// see tests/e2e/clock.ts. The late-arrival test below asserts the stamp reaches
// the regularization queue, and this page's subject is the first seed employee,
// who is rostered off on Mondays.

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Point an employee record at the signed-in account, so the page has an
 * employee for it to *be*.
 *
 * Check-in is self-only: the signed-in user stamps their own day and nobody
 * else's. The test personas are auth accounts with no directory record, so
 * without this there is nobody for them to check in as. Setting the address
 * through Edit Profile is how an administrator links the two in the app.
 *
 * Returns the linked employee's name.
 */
async function linkAccountToEmployee(page: Page): Promise<string> {
  await page.goto('/employees');
  // The directory opens in card view; the clickable rows are in list view.
  await page.locator('button[title="List view"]').click();
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page).toHaveURL(/\/employees\/emp-/);

  const name = (await page.getByRole('heading').first().innerText()).trim();
  await page.getByRole('button', { name: /Edit Profile/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="email"]').fill(PERSONA.email);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
  return name;
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

// The card heads itself "Today · <date>", or "Open shift · <date>" when it is
// about a shift that ran past midnight.
const clockCard = (page: Page) =>
  page.locator('div').filter({ hasText: /^(Today|Open shift) · / }).last();

/** The check-in time the card is showing, as `HH:mm`. */
async function stampedCheckIn(page: Page): Promise<string> {
  const text = await clockCard(page).innerText();
  return text.match(/In (\d{2}:\d{2})/)![1];
}

test.describe.serial('check in and check out', () => {
  let page: Page;
  let linkedName: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Sign in on the real clock: fixing it first risks Firebase rejecting the
    // token for an expiry that has not happened yet.
    await login(page);
    linkedName = await linkAccountToEmployee(page);
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

  test('another employee\'s day offers no check-in at all', async () => {
    await page.goto('/my-attendance');
    // Switch the picker to somebody who is not the signed-in account.
    const picker = page.locator('select').first();
    const other = await picker
      .locator('option')
      .filter({ hasNotText: linkedName })
      .first()
      .getAttribute('value');
    await picker.selectOption(other as string);

    // The day's state is still visible — it is the stamping that is refused.
    await expect(page.getByText(/Only \w+ can check in and out/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check In' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check Out' })).toHaveCount(0);
  });

  test('a manager can approve the day the late stamp raised', async () => {
    // The previous spec left the browser on My Attendance.
    await page.goto('/attendance');
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
  test('a shift running past midnight can still be closed', async () => {
    // Check in at 23:50, then let the date roll over before checking out.
    await page.clock.setFixedTime(istDay(0, '23:50'));
    await resetAttendance(page);
    await page.goto('/my-attendance');
    await page.getByRole('button', { name: 'Check In' }).click();
    await expect(clockCard(page)).toContainText('In 23:50');

    // Midnight passes. Keyed on today alone, the shift became unreachable here:
    // the panel offered a fresh check-in while the real day stayed open at 0h.
    await page.clock.setFixedTime(istDay(1, '00:05'));
    await page.reload();

    const card = clockCard(page);
    await expect(card).toContainText('Open shift');
    await expect(card).toContainText('In 23:50');
    await expect(page.getByRole('button', { name: 'Check Out' })).toBeEnabled();

    await page.getByRole('button', { name: 'Check Out' }).click();

    // The panel now offers a fresh day, which is right — so the closed shift is
    // asserted where it lives, in the records table.
    await expect(card).toContainText('Not checked in yet today.');
    const closed = page
      .getByRole('table')
      .first()
      .locator('tbody tr')
      .filter({ hasText: '23:50' });
    await expect(closed.first()).toContainText('00:05');

    // 23:50 -> 00:05 is fifteen minutes, measured across the date boundary.
    const hours = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => /attendanceRecords/i.test(k))!;
      return JSON.parse(localStorage[key]).find((r: any) => r.checkIn === '23:50')?.workedHours;
    });
    expect(hours).toBe(0.25);
  });
});
