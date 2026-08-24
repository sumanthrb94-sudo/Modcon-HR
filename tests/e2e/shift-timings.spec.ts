import { test, expect, type Browser, type Page } from '@playwright/test';
import { HR_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * The hours an organisation runs belong to the organisation, not to a browser.
 *
 * Shift timings were two platform constants — a `'General (09:00 – 18:00)'`
 * caption and an unrelated `'09:15'` grace — so every tenant on the deployment
 * worked the same day, and a night shift would have been flagged late every
 * night. HR now declares them.
 *
 * What that means for a test: reloading proves nothing, because the
 * localStorage cache reloads with it. The claim is about the organisation's
 * Firestore copy, so this reads that copy directly and then reads the
 * assignment back from a **second browser context** — one that has never
 * cached anything.
 *
 * The arithmetic is not tested here. Whether a 00:30 arrival on a 22:00 shift
 * counts as late is a pure function with no organisation in it, covered by
 * tests/unit/shiftRules.test.ts, where the case can actually be enumerated —
 * and where it failed before the +1440 was written.
 *
 * Runs in the org-settings project: it writes `org_settings/<org>__shifts` and
 * `__employeeShifts`, which are shared configuration, the same reason
 * salary-structure.spec.ts and location-directory.spec.ts are there. It
 * restores both documents at each end — an interrupted run otherwise strands a
 * fake shift that is offered to every employee and looks exactly like a real
 * one.
 */

const NIGHT_NAME = 'E2E Night';
const RENAMED_NIGHT = 'E2E Night Watch';
const SPARE_NAME = 'E2E Spare';
const SHIFTS_DOC = 'org_settings/default__shifts';
const ASSIGNMENTS_DOC = 'org_settings/default__employeeShifts';
const OVERRIDES_DOC = 'org_settings/default__employeeShiftOverrides';

interface Shift {
  id: string;
  name: string;
  start: string;
  end: string;
  graceMinutes: number;
}
interface ShiftConfig {
  shifts: Shift[];
  defaultShiftId: string | null;
}

// ---- Reading and restoring the organisation's own copy ---------------------

async function readSetting<T>(docPath: string): Promise<T | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  return typeof raw === 'string' ? (JSON.parse(raw) as T) : null;
}

async function writeSetting(docPath: string, value: unknown): Promise<void> {
  const token = await adminToken();
  if (!token) return;
  await fetch(`${FIRESTORE_BASE}/${docPath}?updateMask.fieldPaths=valueJson`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { valueJson: { stringValue: JSON.stringify(value) } } }),
  });
}

/** What the organisation's Firestore copy holds, not what this browser cached. */
const publishedShifts = () => readSetting<ShiftConfig>(SHIFTS_DOC);
const publishedAssignments = () => readSetting<Record<string, string>>(ASSIGNMENTS_DOC);
const publishedCustomHours = () =>
  readSetting<Record<string, { start: string; end: string; graceMinutes: number }>>(OVERRIDES_DOC);

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(HR_PERSONA.email);
  await page.locator('#password').fill(HR_PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openShiftsTab(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Shifts' }).click();
  await expect(page.getByRole('heading', { name: 'Working hours' })).toBeVisible({ timeout: 20_000 });
}

async function addShift(page: Page, name: string, start: string, end: string, grace: number) {
  await page.getByRole('button', { name: 'Add shift' }).click();
  await page.getByLabel('Name of the new shift').fill(name);
  await page.getByLabel('Start of the new shift').fill(start);
  await page.getByLabel('End of the new shift').fill(end);
  await page.getByLabel('Grace period of the new shift, in minutes').fill(String(grace));
  await page.getByRole('button', { name: 'Save shift' }).click();
  await expect(page.getByLabel(`Name of the ${name} shift`)).toBeVisible();
}

test.describe.serial('shift timings are the organisation\'s', () => {
  let page: Page;
  let restoreShifts: ShiftConfig | null = null;
  let restoreAssignments: Record<string, string> | null = null;
  let restoreCustomHours: Record<string, unknown> | null = null;

  test.beforeAll(async ({ browser }) => {
    // Snapshot before anything is written, so an interrupted run can be put
    // back exactly rather than approximately.
    restoreShifts = await publishedShifts();
    restoreAssignments = await publishedAssignments();
    restoreCustomHours = await publishedCustomHours();

    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await writeSetting(SHIFTS_DOC, restoreShifts ?? { shifts: [], defaultShiftId: null });
    await writeSetting(ASSIGNMENTS_DOC, restoreAssignments ?? {});
    await writeSetting(OVERRIDES_DOC, restoreCustomHours ?? {});
    await page?.close();
  });

  test('a declared shift reaches the organisation, not just this browser', async () => {
    await openShiftsTab(page);
    await addShift(page, NIGHT_NAME, '22:00', '06:00', 15);

    await expect
      .poll(async () => (await publishedShifts())?.shifts.some((shift) => shift.name === NIGHT_NAME), {
        timeout: 15_000,
      })
      .toBe(true);

    const published = await publishedShifts();
    const night = published?.shifts.find((shift) => shift.name === NIGHT_NAME);
    // The hours themselves, not merely that something was written.
    expect(night?.start).toBe('22:00');
    expect(night?.end).toBe('06:00');
    expect(night?.graceMinutes).toBe(15);
  });

  test('assigning somebody their own hours is visible to another administrator', async ({ browser }: { browser: Browser }) => {
    const night = (await publishedShifts())?.shifts.find((shift) => shift.name === NIGHT_NAME);
    expect(night, 'the shift declared by the previous test').toBeTruthy();

    // Assigned through the store rather than the profile dialog: this test is
    // about whether the assignment leaves the browser, and driving the form is
    // what the profile's own coverage is for.
    await writeSetting(ASSIGNMENTS_DOC, { 'emp-002': night!.id });

    // A second context — no localStorage of its own, so what it shows can only
    // have come from the organisation's copy.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    try {
      await login(otherPage);
      await openShiftsTab(otherPage);
      await expect(otherPage.getByText(`${night!.name} (22:00 – 06:00)`)).toBeVisible({ timeout: 20_000 });
    } finally {
      await other.close();
    }
  });

  test('a shift somebody is on cannot be withdrawn', async () => {
    await openShiftsTab(page);
    await page.reload();
    await page.getByRole('button', { name: 'Shifts' }).click();

    await page.getByRole('button', { name: `Withdraw the ${NIGHT_NAME} shift` }).click();

    await expect(page.getByText(/Move them to another shift before withdrawing it/)).toBeVisible();
    // Still there, in the organisation's copy and not merely on screen.
    expect((await publishedShifts())?.shifts.some((shift) => shift.name === NIGHT_NAME)).toBe(true);
  });

  test('renaming a shift keeps the people on it, because assignment is by id', async () => {
    const before = (await publishedShifts())?.shifts.find((shift) => shift.name === NIGHT_NAME);
    expect(before).toBeTruthy();

    await openShiftsTab(page);
    await page.getByLabel(`Name of the ${NIGHT_NAME} shift`).fill(RENAMED_NIGHT);
    await page.getByLabel(`Name of the ${RENAMED_NIGHT} shift`).blur();

    await expect
      .poll(async () => (await publishedShifts())?.shifts.some((shift) => shift.name === RENAMED_NIGHT), {
        timeout: 15_000,
      })
      .toBe(true);

    const after = (await publishedShifts())?.shifts.find((shift) => shift.name === RENAMED_NIGHT);
    // Same id, so nobody had to be re-assigned — the failure this guards is a
    // rename that strands its occupants on a shift that no longer exists.
    expect(after?.id).toBe(before?.id);
    expect((await publishedAssignments())?.['emp-002']).toBe(before?.id);
  });

  test('hours belonging to one person reach the organisation, and clear their assignment', async () => {
    // Assigned to a company shift first, so the mutual exclusion is what the
    // test observes rather than something it assumes.
    const night = (await publishedShifts())?.shifts.find((shift) => shift.name === RENAMED_NIGHT);
    expect(night, 'the shift renamed by the previous test').toBeTruthy();
    expect((await publishedAssignments())?.['emp-002']).toBe(night!.id);

    await page.goto('/employees');
    await page.getByText('Priya', { exact: false }).first().click();
    await page.getByRole('button', { name: /Edit/ }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Shift').selectOption({ label: 'Custom hours for this person' });
    await dialog.getByLabel("Start of this employee's own hours").fill('10:00');
    await dialog.getByLabel("End of this employee's own hours").fill('19:00');
    await dialog.getByLabel("Grace period of this employee's own hours, in minutes").fill('5');
    await dialog.getByRole('button', { name: /Save/ }).click();

    await expect
      .poll(async () => Object.keys((await publishedCustomHours()) ?? {}).length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const [employeeId, hours] = Object.entries((await publishedCustomHours())!)[0];
    expect(hours.start).toBe('10:00');
    expect(hours.end).toBe('19:00');
    expect(hours.graceMinutes).toBe(5);

    // The two stores must never hold a contradiction about one person:
    // resolution prefers the custom hours, so an assignment left behind would
    // silently do nothing.
    expect((await publishedAssignments())?.[employeeId]).toBeUndefined();
  });

  test('an empty shift can be withdrawn', async () => {
    await openShiftsTab(page);
    await addShift(page, SPARE_NAME, '07:00', '16:00', 10);

    await page.getByRole('button', { name: `Withdraw the ${SPARE_NAME} shift` }).click();
    await expect(page.getByLabel(`Name of the ${SPARE_NAME} shift`)).toHaveCount(0);

    await expect
      .poll(async () => (await publishedShifts())?.shifts.some((shift) => shift.name === SPARE_NAME), {
        timeout: 15_000,
      })
      .toBe(false);
  });
});
