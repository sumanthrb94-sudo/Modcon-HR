import { test, expect, type Page, type Locator } from '@playwright/test';
import { PERSONAS } from './config';
import { istToday } from './clock';
import { clearOrgRecords, listOrgRecords } from './firestore';

/**
 * Attendance → Regularizations → Approvals, end to end.
 *
 * The regularization queue is *derived* from attendance records rather than
 * seeded with invented requests, which makes it only as correct as the path
 * between the two. These specs drive that path with simulated attendance —
 * on-time, late and absent days — and then follow a request through raising,
 * queueing and being decided.
 *
 * The assertions deliberately target the joins rather than any single page:
 *
 *   - a day marked Absent or late must *become* a flagged entry, and an
 *     on-time day must not;
 *   - `requestedStatus` must exist only where a person chose one;
 *   - a decision made on one approval surface must be visible on the other,
 *     and must survive a reload;
 *   - approving a request that asks for a status must actually move the
 *     attendance record to it, or the approval changed nothing.
 */
const PERSONA = PERSONAS.admin;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Start from a queue with nothing stored, so each spec sees the derivation
 * rather than a previous spec's decisions. Storage is org-scoped, so the key is
 * matched by substring rather than pinned.
 */
async function resetRegularizationStore(page: Page) {
  // Both copies. Clearing localStorage alone stopped being a reset when these
  // records moved to Firestore: the subscription hydrates the cache straight
  // back from the server. See src/data/persistence.ts.
  await clearOrgRecords('regularizationOverrides');
  await page.goto('/attendance');
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => /regulariz/i.test(key))
      .forEach((key) => localStorage.removeItem(key));
  });
  await page.reload();
}

/** The Regularization Requests table on the Attendance page. */
function regTable(page: Page): Locator {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Requested' }) });
}

/** One queue row, found by the text of its reason. */
function regRow(page: Page, text: string | RegExp): Locator {
  return regTable(page).locator('tbody tr').filter({ hasText: text });
}

/**
 * Mark one employee's attendance for today through the Attendance page.
 *
 * This is the data simulation the suite runs on: the records it writes are what
 * the queue then has to derive from, so the flagged entries are a consequence of
 * real user action rather than of the seed.
 */
async function markAttendance(
  page: Page,
  employeeLabel: string,
  status: string,
  checkIn?: string,
) {
  await page.goto('/attendance');
  await page.getByRole('button', { name: /Mark Attendance/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').first().selectOption({ label: employeeLabel });
  await dialog.locator('select').nth(1).selectOption(status);
  if (checkIn) {
    await dialog.locator('input[type="time"]').first().fill(checkIn);
  }
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

/** The labels of the first N employees the Mark Attendance select offers. */
async function employeeLabels(page: Page, count: number): Promise<string[]> {
  await page.goto('/attendance');
  await page.getByRole('button', { name: /Mark Attendance/i }).first().click();
  const dialog = page.getByRole('dialog');
  const select = dialog.locator('select').first();
  await expect(select.locator('option').nth(1)).toBeAttached();
  const labels = (await select.locator('option').allTextContents()).slice(1, 1 + count);
  await page.keyboard.press('Escape');
  return labels;
}

/** "Aarav Sharma (MC-001)" → "Aarav Sharma" */
const nameOf = (label: string) => label.replace(/\s*\(.*\)\s*$/, '');

/**
 * Today's date as the app computes it, read off the Attendance page's own day
 * filter rather than from the test's clock — `Mark Attendance` always writes
 * for today, so a request raised against any other day would be about a
 * different record than the one just simulated.
 */
async function todayValue(page: Page): Promise<string> {
  await page.goto('/attendance');
  const option = page.locator('option', { hasText: '(Today)' }).first();
  await expect(option).toBeAttached();
  return (await option.getAttribute('value')) as string;
}

test.describe.serial('regularizations derive from attendance', () => {
  let page: Page;
  let people: string[];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Anchored on a working day, not the wall clock: these tests mark the day
    // and expect it flagged, and a record on the subject's own week-off is
    // deliberately never flagged. See tests/e2e/clock.ts.
    await page.clock.setFixedTime(istToday('10:00'));
    await login(page);
    people = await employeeLabels(page, 3);
    await resetRegularizationStore(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('an absence marked today becomes a flagged entry', async () => {
    await markAttendance(page, people[0], 'Absent');

    const row = regRow(page, new RegExp(nameOf(people[0])));
    await expect(row.first()).toBeVisible();
    // Derived from the record just written, not from the seed.
    await expect(row.first()).toContainText('Marked absent');
    // Nobody asked for anything, so no status is claimed.
    await expect(row.first().getByText('—', { exact: true })).toBeVisible();
    // The Recorded column carries what the day actually says.
    await expect(row.first().getByText('Absent', { exact: true })).toBeVisible();
  });

  test('a late check-in becomes a flagged entry quoting its own time', async () => {
    await markAttendance(page, people[1], 'Present', '09:45');

    const row = regRow(page, new RegExp(nameOf(people[1])));
    await expect(row.first()).toBeVisible();
    await expect(row.first()).toContainText('Checked in at 09:45');
    await expect(row.first().getByText('—', { exact: true })).toBeVisible();
    await expect(row.first().getByText('Late', { exact: true })).toBeVisible();
  });

  test('an on-time check-in is not flagged', async () => {
    await markAttendance(page, people[2], 'Present', '08:55');

    // Present and punctual is not something to regularize. Scoped to the
    // queue table so the person's row in Daily Attendance does not count.
    await expect(regRow(page, new RegExp(nameOf(people[2])))).toHaveCount(0);
  });

  test('a late Work From Home is late too', async () => {
    // Lateness is about when the day started, not where it was worked. Mark
    // Attendance used to require status Present, so this day was on time here
    // while the identical day in seed data — which derives from the check-in
    // alone — was late. The two writers now share one rule.
    await markAttendance(page, people[2], 'Work From Home', '09:52');

    const row = regRow(page, new RegExp(nameOf(people[2])));
    await expect(row.first()).toBeVisible();
    await expect(row.first()).toContainText('Checked in at 09:52');
    await expect(row.first().getByText('Late', { exact: true })).toBeVisible();
  });

  test('the flagged entries survive a reload', async () => {
    await page.reload();
    await expect(regRow(page, new RegExp(nameOf(people[0]))).first()).toBeVisible();
    await expect(regRow(page, new RegExp(nameOf(people[1]))).first()).toBeVisible();
  });
});

test.describe.serial('deciding a regularization', () => {
  let page: Page;
  let person: string;
  let today: string;
  const reason = `Client site all day ${Date.now().toString(36)}`;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Same anchor as the block above — the request raised here is against the
    // day just marked, so it has to be a day the subject actually works.
    await page.clock.setFixedTime(istToday('10:00'));
    await login(page);
    person = (await employeeLabels(page, 1))[0];
    today = await todayValue(page);
    await resetRegularizationStore(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a raised request states the status its author chose', async () => {
    // Absent today, so there is a real day to correct.
    await markAttendance(page, person, 'Absent');

    await page.goto('/my-attendance');
    // Admins pick whose attendance they are looking at.
    await page.locator('select').first().selectOption({ label: person });
    await page.getByRole('button', { name: /Request Regularization/i }).click();

    const dialog = page.getByRole('dialog');
    // Pin to the day that was actually marked Absent. The select is sorted
    // newest-first, so its default is Friday, not today.
    await dialog.locator('select').first().selectOption(today);
    await dialog.locator('select').nth(1).selectOption('Work From Home');
    await dialog.getByPlaceholder('Why should this day be corrected?').fill(reason);
    await dialog.getByRole('button', { name: 'Submit Request' }).click();
    await expect(dialog).toBeHidden();

    await page.goto('/attendance');
    const row = regRow(page, reason);
    await expect(row.first()).toBeVisible();
    // A person chose this, so it is stated rather than blank.
    await expect(row.first().getByText('Work From Home', { exact: true })).toBeVisible();
  });

  test('the approvals page labels an entry nobody requested', async () => {
    await page.goto('/dashboard/pending-approvals/regularizations');
    // The raised request shows its chosen status...
    await expect(page.getByText('Work From Home').first()).toBeVisible();
    // ...and a derived one says where it came from instead of a blank badge.
    await expect(page.getByText('Flagged from record').first()).toBeVisible();
  });

  test('a decision on the approvals page persists and reaches the queue', async () => {
    await page.goto('/dashboard/pending-approvals/regularizations');
    const card = page.locator('div').filter({ hasText: reason }).last();
    await card.getByRole('button', { name: 'Approve' }).click();

    // Gone from the pending list on the page that decided it.
    await expect(page.getByText(reason)).toHaveCount(0);

    // The decision has to be ON THE SERVER before this page reloads.
    // `save()` is optimistic — it writes the cache, fires the change event and
    // returns, committing afterwards — and a reload is a fresh Firestore SDK
    // with an empty mutation queue, so an un-acked write is simply gone. The
    // subscription then hydrates the cache from the server's older copy and
    // the approval silently reverts, which is exactly the failure this used to
    // produce: the queue on /attendance still said Pending.
    await expect
      .poll(async () => {
        const stored = await listOrgRecords<{ reason?: string; status?: string }>(
          'regularizationOverrides',
        );
        return stored.find((record) => record.reason === reason)?.status ?? null;
      }, { timeout: 15_000 })
      .toBe('Approved');

    // Still gone after a reload — a decision held in React state only would
    // reappear here, which is the whole point of this assertion.
    await page.reload();
    await expect(page.getByText(reason)).toHaveCount(0);

    // And the other approval surface agrees.
    await page.goto('/attendance');
    await expect(regRow(page, reason).first()).toContainText('Approved');
  });

  test('approving a request moves the attendance record to what was asked', async () => {
    // The request asked for Work From Home on a day recorded Absent. If
    // approval does not apply it, the approval changed nothing at all.
    await page.goto('/attendance');
    const row = regRow(page, reason).first();
    await expect(row).toBeVisible();
    // Recorded (3rd cell) and Requested (4th) must now agree — before the fix
    // Recorded still said Absent while Requested said Work From Home.
    await expect(row.locator('td').nth(2)).toContainText('Work From Home');
    await expect(row.locator('td').nth(3)).toContainText('Work From Home');

    // And the day itself, in the Daily Attendance table.
    const dailyTable = page.locator('table').first();
    const dayRow = dailyTable.locator('tbody tr').filter({ hasText: nameOf(person) });
    await expect(dayRow.first()).toContainText('Work From Home');
  });

  test('rejecting leaves the attendance record untouched', async () => {
    await resetRegularizationStore(page);
    await markAttendance(page, person, 'Absent');

    const row = regRow(page, new RegExp(nameOf(person)));
    await expect(row.first()).toBeVisible();
    await row.first().getByRole('button', { name: 'Reject' }).click();
    await expect(row.first()).toContainText('Rejected');

    // The day is still Absent: a rejection decides the request, not the record.
    const dailyTable = page.locator('table').first();
    const dayRow = dailyTable.locator('tbody tr').filter({ hasText: nameOf(person) });
    await expect(dayRow.first()).toContainText('Absent');
  });
});
