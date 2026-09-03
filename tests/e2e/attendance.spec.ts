import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { waitForOrgRecordsQuiet } from './firestore';

/**
 * The Mark Attendance employee select must offer the people who are actually
 * on the books.
 *
 * It used to map the exported `employees` seed snapshot and filter only by
 * visibility scope, so anyone whose status had since been set to "Resigned"
 * was still offered as someone whose day you could record. Marking attendance
 * for a person who has left the company is not a day that exists.
 *
 * The assertion below is deliberately made *after* changing a status through
 * the UI: asserting against the untouched seed would pass whether or not the
 * filter is there, because no seed employee ships as Resigned.
 */
const PERSONA = PERSONAS.admin;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** The labels the Mark Attendance select currently offers, placeholder excluded. */
async function markAttendanceOptions(page: Page): Promise<string[]> {
  await page.goto('/attendance');
  await page.getByRole('button', { name: /Mark Attendance/i }).first().click();
  const dialog = page.getByRole('dialog');
  const select = dialog.locator('select').first();
  await expect(select.locator('option').nth(1)).toBeAttached();
  const labels = await select.locator('option').allTextContents();
  await page.keyboard.press('Escape');
  // The first option is the "Select employee…" placeholder, not a person.
  return labels.slice(1);
}

/** Set one employee's status through the profile UI, as HR actually would. */
async function setStatus(page: Page, employeeName: string, status: string) {
  await page.goto('/employees');
  await page.getByText(employeeName, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/employees\/emp-/);

  await page.getByRole('button', { name: /Edit Profile/i }).click();
  const dialog = page.getByRole('dialog');
  // The status field is the only select offering "Resigned"; the modal also
  // holds department, manager and employment-type selects.
  const statusSelect = dialog.locator('select', {
    has: page.locator('option[value="Resigned"]'),
  });
  await statusSelect.selectOption(status);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('Mark Attendance employee list', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('offers employees on the books and drops one who resigns', async () => {
    const before = await markAttendanceOptions(page);
    expect(before.length).toBeGreaterThan(1);

    // Whoever the scope happens to offer first, rather than a pinned employee
    // id — the list is filtered by who this viewer may see. The label reads
    // "Full Name (MC-000)"; the profile page is found by the name alone.
    const label = before[0];
    const name = label.replace(/\s*\(.*\)\s*$/, '');

    await setStatus(page, name, 'Resigned');

    const after = await markAttendanceOptions(page);
    expect(after).not.toContain(label);
    expect(after.length).toBe(before.length - 1);
    // Everyone else is still offered — the filter must not empty the list.
    expect(after.length).toBeGreaterThan(0);

    // Put the directory back, so a re-run in a reused profile starts clean.
    await setStatus(page, name, 'Active');
    expect(await markAttendanceOptions(page)).toContain(label);
  });
});

/**
 * A regularization an employee raises has to reach the approver's queue, and
 * still be there after a refresh.
 *
 * The queue used to be five invented requests with hand-written reasons, and
 * nothing in the app could add to it. Asserting only on the My Attendance page
 * that raised the request would pass on React state alone, so the assertion
 * that matters is made on the *other* page, after a reload.
 */
test.describe.serial('raising a regularization', () => {
  let page: Page;
  // Unique per run so a re-run never passes on the previous run's request.
  const reason = `Client site visit ${Date.now().toString(36)} — VPN missed the check-in.`;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('reaches the approval queue and survives a reload', async () => {
    await page.goto('/my-attendance');
    await page.getByRole('button', { name: /Request Regularization/i }).click();

    const dialog = page.getByRole('dialog');
    // Date is prefilled; only the reason is required beyond it.
    await dialog.getByPlaceholder('Why should this day be corrected?').fill(reason);
    const statusSelect = dialog.locator('select').nth(1);
    await statusSelect.selectOption('Work From Home');
    await dialog.getByRole('button', { name: 'Submit Request' }).click();
    await expect(dialog).toBeHidden();

    // Listed for the employee it was raised against.
    await expect(page.getByRole('table').getByText(reason)).toBeVisible();

    // The approver's queue on a different page is the real assertion.
    await page.goto('/attendance');
    await expect(page.getByRole('table').getByText(reason)).toBeVisible();

    // The request has to be on the server before this page is thrown away.
    // `save()` is optimistic — it writes the cache, fires the change event and
    // returns — and a reload is a fresh Firestore SDK with an empty mutation
    // queue, so an un-acked write is discarded and the subscription hydrates
    // the cache from the server's older copy. Surviving a reload is what this
    // test is about, so racing the commit proves nothing either way.
    // See docs/shared-records-spec.md §9.
    await waitForOrgRecordsQuiet('regularizationOverrides');
    await page.reload();
    await expect(page.getByRole('table').getByText(reason)).toBeVisible();
  });

  test('the queue is derived from real attendance records', async () => {
    await page.goto('/attendance');
    // Every derived reason quotes the record it came from, rather than the
    // invented "Biometric device malfunction at entry gate" it replaced.
    const derived = page.getByText(/Marked absent — no check-in|flagged as a late arrival/);
    // toBeVisible auto-waits; `count()` does not, and the route is lazy-loaded,
    // so counting first only ever measured the loading spinner.
    await expect(derived.first()).toBeVisible();
    expect(await derived.count()).toBeGreaterThan(0);
    // The old hand-written seed reasons must be gone.
    await expect(page.getByText('Biometric device malfunction at entry gate.')).toHaveCount(0);
  });

  test('a flagged day claims no requested status, a raised one does', async () => {
    await page.goto('/attendance');
    const flagged = page
      .getByRole('row')
      .filter({ hasText: /Marked absent — no check-in/ })
      .first();
    await expect(flagged).toBeVisible();
    // Nobody asked for anything on a day the app flagged, so the Requested
    // cell is empty. It used to read "Present" on every one of these.
    await expect(flagged.getByText('—', { exact: true })).toBeVisible();
    // The Recorded cell carries the real value off the attendance record.
    await expect(flagged.getByText('Absent', { exact: true })).toBeVisible();

    // The request raised in the first test states what its author chose.
    const raised = page.getByRole('row').filter({ hasText: reason }).first();
    await expect(raised.getByText('Work From Home', { exact: true })).toBeVisible();
  });
});

/**
 * The day filter must always offer today.
 *
 * The options were the Mon–Fri working week, but Mark Attendance always writes
 * for `todayIso()` and then selects that day. On a Saturday or Sunday the two
 * disagreed: the Select was left holding a date absent from its own option
 * list, so the rows on screen belonged to a day the control could not name and
 * no option led back to them. The page opened on Friday as well, so a day
 * marked at the weekend read as though nothing had been written.
 *
 * The filter now offers all seven days of the week, because the working week
 * became six days with the missing day differing per employee (week-offs are
 * rostered across Sunday, Monday and Tuesday). That makes "today is always an
 * option" structural rather than a special case — which is the point, but it
 * also means this test would now pass against a Mon–Sun window that had lost
 * the original fix. The `toHaveValue` assertion is what still guards it: the
 * bug was the Select holding a date its own options did not contain.
 *
 * The clock is pinned because the bug was invisible Monday to Friday — this
 * suite ran green for months and only failed once a run happened to land on a
 * Saturday. Times are 09:00 IST (03:30Z) so the pinned instant is unambiguously
 * that IST calendar day; see src/lib/today.ts, which answers every calendar
 * question in Asia/Kolkata rather than UTC.
 */
const DAY_FILTER_CASES = [
  { label: 'Saturday', instant: '2026-08-01T03:30:00Z', iso: '2026-08-01' },
  { label: 'Sunday', instant: '2026-08-02T03:30:00Z', iso: '2026-08-02' },
  { label: 'Wednesday', instant: '2026-07-29T03:30:00Z', iso: '2026-07-29' },
];

for (const day of DAY_FILTER_CASES) {
  test(`the attendance day filter offers today on a ${day.label}`, async ({ page }) => {
    // Before any navigation, so the app never observes the real clock.
    await page.clock.install({ time: new Date(day.instant) });
    await login(page);
    await page.goto('/attendance');

    const dayFilter = page.locator('select').filter({ has: page.locator('option:has-text("(Today)")') }).first();
    await expect(dayFilter).toBeAttached();

    const values = await dayFilter.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(values).toContain(day.iso);

    // Exactly one option may claim to be today.
    const todayLabels = await dayFilter.locator('option:has-text("(Today)")').allTextContents();
    expect(todayLabels).toHaveLength(1);

    // The control must be showing a day it actually offers — this is what
    // broke: selectedDate held a date the option list did not contain.
    await expect(dayFilter).toHaveValue(day.iso);

    // Monday to Sunday, every week. Saturday and Sunday are working days for
    // most of the company now, so a five-option filter could not show them.
    expect(values).toHaveLength(7);
  });
}

/**
 * Week-offs are per employee, and the app must treat them as such.
 *
 * The organisation rosters one week-off per person across Sunday, Monday and
 * Tuesday — so the same Monday is an ordinary working day for most of the
 * company and a day off for the sales and support teams. Nothing here may be
 * asserted with a fixed "weekends are Sat/Sun" rule; every check below is
 * relative to the employee being looked at.
 *
 * The clock is pinned to a known Monday so "who is off today" is a fact the
 * test can state rather than something it has to re-derive from the calendar.
 */
const MONDAY = { instant: '2026-07-27T03:30:00Z', iso: '2026-07-27' };

/** Someone seeded with a Monday week-off, and someone seeded without one. */
const MONDAY_OFF_EMPLOYEE = 'Sanjay Malhotra';
const SUNDAY_OFF_EMPLOYEE = 'Diya Mehta';

/**
 * Select someone in the My Attendance picker by name.
 *
 * By value rather than by label: the options read "Full Name (MC-000)", and
 * selectOption's `label` takes a string only — a regex is rejected at runtime,
 * not at compile time. Resolving the value here keeps the employee code, which
 * is seed trivia, out of the tests.
 */
async function pickEmployee(page: Page, fullName: string) {
  const picker = page.locator('select').first();
  // The picker is populated from the directory after mount, so its options are
  // not there on first paint. Without this the evaluate below runs against an
  // empty list and reports the employee as missing rather than waiting.
  await expect(picker.locator('option').filter({ hasText: fullName })).toHaveCount(1, {
    timeout: 20_000,
  });
  const value = await picker.locator('option').evaluateAll(
    (options, name) =>
      (options as HTMLOptionElement[]).find((option) => option.textContent?.startsWith(name))?.value ?? '',
    fullName,
  );
  expect(value, `no option for ${fullName}`).not.toBe('');
  await picker.selectOption(value);
}

test.describe('per-employee week offs', () => {
  test('the attendance page names who is off, and it is not everyone', async ({ page }) => {
    await page.clock.install({ time: new Date(MONDAY.instant) });
    await login(page);
    await page.goto('/attendance');

    // The <p>, not the count <span> inside it — the names live on the paragraph.
    const offNote = page.locator('p').filter({ hasText: /on week off/i }).first();
    await expect(offNote).toBeVisible();

    // The people rostered off this Monday are named; someone whose week-off is
    // Sunday must not be among them, or the app is treating the week-off as a
    // company-wide day rather than a personal one.
    const noteText = (await offNote.textContent()) ?? '';
    expect(noteText).toContain(MONDAY_OFF_EMPLOYEE);
    expect(noteText).not.toContain(SUNDAY_OFF_EMPLOYEE);
  });

  test('an employee cannot raise a regularization against their own week off', async ({ page }) => {
    await page.clock.install({ time: new Date(MONDAY.instant) });
    await login(page);
    await page.goto('/my-attendance');

    // Admins pick whose attendance they are viewing.
    await pickEmployee(page, MONDAY_OFF_EMPLOYEE);
    await expect(page.getByText(/week off Monday/i)).toBeVisible();

    await page.getByRole('button', { name: /Request Regularization/i }).click();
    const dialog = page.getByRole('dialog');
    const dateOptions = await dialog.locator('select').first().locator('option').evaluateAll(
      (options) => options.map((option) => (option as HTMLOptionElement).value),
    );

    // Every Monday in the list would be a day this person was rostered off.
    const mondays = dateOptions.filter((iso) => iso && new Date(iso).getUTCDay() === 1);
    expect(mondays).toEqual([]);
    // The list is not simply empty — other days are still offered.
    expect(dateOptions.filter(Boolean).length).toBeGreaterThan(0);
  });

  test('the same day is offered to someone whose week off is a different day', async ({ page }) => {
    await page.clock.install({ time: new Date(MONDAY.instant) });
    await login(page);
    await page.goto('/my-attendance');

    await pickEmployee(page, SUNDAY_OFF_EMPLOYEE);
    await expect(page.getByText(/week off Sunday/i)).toBeVisible();

    await page.getByRole('button', { name: /Request Regularization/i }).click();
    const dialog = page.getByRole('dialog');
    const dateOptions = await dialog.locator('select').first().locator('option').evaluateAll(
      (options) => options.map((option) => (option as HTMLOptionElement).value),
    );

    // This is the assertion that makes the previous test mean something: the
    // Monday withheld from Sanjay is offered here, so it was withheld because
    // of *his* roster and not because Mondays are excluded for everyone.
    expect(dateOptions).toContain(MONDAY.iso);
    expect(dateOptions.filter((iso) => iso && new Date(iso).getUTCDay() === 0)).toEqual([]);
  });

  test('HR can change an employee week off and the app follows', async ({ page }) => {
    await page.clock.install({ time: new Date(MONDAY.instant) });
    await login(page);
    await page.goto('/employees');
    await page.getByText(SUNDAY_OFF_EMPLOYEE, { exact: true }).first().click();
    await expect(page).toHaveURL(/\/employees\/emp-/);
    await expect(page.getByText('Week Off')).toBeVisible();

    await page.getByRole('button', { name: /Edit Profile/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select').filter({ has: page.locator('option[value="Tuesday"]') }).first()
      .selectOption('Tuesday');
    await dialog.getByRole('button', { name: /^Save/i }).click();
    await expect(dialog).toBeHidden();

    // Reload: a roster that only survives until refresh is not a roster.
    await page.reload();
    await expect(page.getByText('Tuesday')).toBeVisible();
  });
});
