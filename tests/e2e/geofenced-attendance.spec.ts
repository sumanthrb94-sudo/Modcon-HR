import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { GEOFENCE_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken, clearOrgRecords, signInPersona } from './firestore';
import { installGeolocationStub, setDenied, setFix } from './geolocation';

/**
 * Geofenced attendance, end to end.
 *
 * This spec drives the client, so it can only ever prove what the client chose
 * to do — the boundary is `tests/rules/attendance-stamps.rules.test.mjs`, and
 * the arithmetic is `tests/unit/geofenceRules.test.ts`. What is worth asserting
 * here is the wiring between the three: that HR drawing a fence in Settings
 * reaches the check-in panel, that an enforced fence actually refuses a stamp
 * *and leaves the day unmarked*, and that a blocked browser is told something
 * it can act on.
 *
 * Everything runs in one signed-in context, and that is forced rather than
 * convenient: check-in is self-only, the test personas are auth accounts with
 * no directory record, and the link between the two is written into the
 * *localStorage* employee directory. A second context would be a browser where
 * the account is nobody, and the panel would not render at all. So the geolocation
 * stub is mutable instead (see ./geolocation.ts) and the position moves between
 * tests rather than the browser.
 *
 * Runs in the org-settings project: it writes the organisation's shared
 * configuration and restores it. A fence left behind is not visible as a fake —
 * it looks like the company's attendance policy, and under enforcement it locks
 * real people out.
 */

// Its own address, not PERSONAS.admin. This spec writes `employee_links/{uid}`,
// which is Firestore and therefore shared with every other project and worker
// in the run — linking a shared persona repoints who that account *is* for
// specs that never mention links. See GEOFENCE_PERSONA in config.ts.
const PERSONA = GEOFENCE_PERSONA;

// ModCon Builders' notional head office, and a point ~330 m north of it —
// outside a 200 m fence by enough that the projection rather than a rounding
// accident is what decides it.
const HQ = { lat: 12.9716, lng: 77.5946 };
const NEAR_MISS = { lat: HQ.lat + 0.003, lng: HQ.lng };
const SITE_NAME = 'E2E Attendance Area';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function firestore(path: string, init: RequestInit = {}) {
  const token = await adminToken();
  return fetch(`${FIRESTORE_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Point an employee record at the signed-in account, so the page has an
 * employee for it to *be* — and tell the server, which is the half that counts.
 *
 * `employee_links/{uid}` is what `isSelf()` in firestore.rules resolves, and
 * therefore what decides whether the stamp write is allowed at all. It is now
 * also what the app resolves the account to, so seeding it is no longer a
 * server-side detail beside a UI one: it is the identity.
 *
 * The work email is still set through Edit Profile, because the two must agree
 * for this spec to be testing the ordinary case rather than the disagreement.
 * Editing an email does not itself write a link — `linkAccountForEmployee`
 * runs on Add Employee, not on an edit, and the identity backfill in
 * Settings → Database is the remedy for records that predate it — so the link
 * is seeded directly the way careers.spec.ts does.
 *
 * Returns the employee id that was linked.
 */
async function linkAccountToEmployee(page: Page): Promise<string> {
  await page.goto('/employees');
  await page.locator('button[title="List view"]').click();
  // The THIRD row, not the first. `check-in-out.spec.ts` links the first and
  // `persistence.spec.ts` marks the first offered — and now that attendance
  // records are the organisation's rather than each browser's, two specs on one
  // employee race for the same document. Distinct people keep them independent
  // without giving up parallelism.
  const firstRow = page.locator('table tbody tr').nth(2);
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page).toHaveURL(/\/employees\/emp-/);
  const employeeId = new URL(page.url()).pathname.split('/').pop() as string;

  await page.getByRole('button', { name: /Edit Profile/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="email"]').fill(PERSONA.email);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();

  const { uid } = await signInPersona(PERSONA.email, PERSONA.password);
  expect(uid, 'could not resolve the persona uid').toBeTruthy();
  await firestore(`employee_links/${uid}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        uid: { stringValue: uid as string },
        employeeId: { stringValue: employeeId },
        orgId: { stringValue: 'default' },
        linkedBy: { stringValue: 'e2e' },
      },
    }),
  });

  return employeeId;
}

/**
 * Clear both records of the day so each scenario starts un-checked-in.
 *
 * The localStorage half is the attendance record. The Firestore half is the
 * stamp, and clearing it out-of-band is *forced* by the feature working: a
 * stamp is immutable and its id is deterministic, so the second scenario's
 * check-in would land on the first scenario's document and be refused as a
 * `create` on something that exists. That refusal is the behaviour we want in
 * production (the first stamp is the one that happened) and an obstacle only
 * here, which is why it is undone with the emulator's owner bypass rather than
 * by loosening the rule.
 */
async function resetAttendance(page: Page, employeeId: string) {
  // The attendance record now lives on the server too, so clearing the cache
  // alone leaves the previous scenario's check-in to be hydrated straight back.
  await clearOrgRecords('attendanceRecords', { employeeId });
  await page.goto('/my-attendance');
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => /attendance|regulariz/i.test(key))
      .forEach((key) => localStorage.removeItem(key));
  });

  const today = istDate(new Date());
  await Promise.all(
    (['in', 'out'] as const).map((kind) =>
      firestore(`attendance_stamps/default__${employeeId}__${today}__${kind}`, { method: 'DELETE' }),
    ),
  );
}

/** `YYYY-MM-DD` in IST, matching what `todayIso()` in the app produces. */
function istDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The organisation's copy, which is what outlives this browser.
 *
 * Asserted against Firestore rather than against the page: the localStorage
 * cache reloads with the page, so a reload proves nothing about whether the
 * organisation's *other* administrators would see the same fence.
 */
async function storedGeofence(): Promise<{ mode?: string; sites?: unknown[] } | null> {
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}/org_settings/default__attendanceGeofence`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { fields?: { valueJson?: { stringValue?: string } } };
  const raw = body.fields?.valueJson?.stringValue;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { mode?: string; sites?: unknown[] };
  } catch {
    return null;
  }
}

/** The rules-readable projection — the copy that decides what the server accepts. */
async function projectionExists(): Promise<boolean> {
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}/attendance_geofences/default`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.ok;
}

async function openGeofenceSettings(page: Page) {
  await page.goto('/settings?tab=geofence');
  await expect(page.getByRole('heading', { name: 'Attendance Locations' })).toBeVisible({
    timeout: 20_000,
  });
}

async function setMode(page: Page, mode: 'off' | 'advisory' | 'enforced') {
  await openGeofenceSettings(page);
  await page.getByRole('radio', { name: new RegExp(`^${mode}`, 'i') }).check();
  await expect.poll(async () => (await storedGeofence())?.mode, { timeout: 15_000 }).toBe(mode);
}

/** The check-in card on My Attendance. */
function clockCard(page: Page) {
  return page.locator('.card', { hasText: /Today ·|Open shift ·/ }).first();
}

test.describe.serial('geofenced attendance', () => {
  let context: BrowserContext;
  let page: Page;
  let employeeId: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await installGeolocationStub(page);
    await login(page);
    // The administrator drawing the fence stands in the office.
    await setFix(page, HQ);
    employeeId = await linkAccountToEmployee(page);
  });

  test.afterAll(async () => {
    // Restore through the UI, so the localStorage cache is put back with the
    // organisation's copy. An enforced fence left behind locks real people out.
    if (page && !page.isClosed()) {
      try {
        await openGeofenceSettings(page);
        const remove = page.getByRole('button', { name: 'Remove' });
        while ((await remove.count()) > 0) {
          await remove.first().click();
          await page.waitForTimeout(300);
        }
        await page.getByRole('radio', { name: /^off/i }).check();
        await expect.poll(async () => (await storedGeofence())?.mode, { timeout: 15_000 }).toBe('off');
      } catch {
        // Best effort — a failure here must not mask the one that caused it.
      }
    }
    // And unlink the account. The link is the app's answer to "who is this
    // account" now, so one left behind is this spec deciding that for every
    // later run — including runs of specs that resolve identity the older way,
    // through the work email.
    try {
      const { uid } = await signInPersona(PERSONA.email, PERSONA.password);
      if (uid) await firestore(`employee_links/${uid}`, { method: 'DELETE' });
    } catch {
      // Best effort, as above.
    }
    await context?.close();
  });

  test('HR draws an attendance area and both copies of it land', async () => {
    await openGeofenceSettings(page);
    await page.getByRole('button', { name: 'Add location' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(SITE_NAME);
    // Use the browser's own position — the ordinary path: an administrator
    // stands in the office and presses the button.
    await dialog.getByRole('button', { name: /Use my current position/i }).click();
    await expect(dialog.getByLabel('Latitude')).toHaveValue(/12\.9716/, { timeout: 15_000 });
    await dialog.getByLabel(/Radius/).fill('200');
    await dialog.getByRole('button', { name: 'Add location' }).click();

    await expect(page.getByText(SITE_NAME)).toBeVisible();

    // The organisation's copy, not this browser's.
    await expect
      .poll(async () => (await storedGeofence())?.sites?.length ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // And the projection the *rules* read. Without it the server refuses every
    // `inside` claim, so a fence that exists only in org_settings is one that
    // silently fails closed.
    await expect.poll(projectionExists, { timeout: 15_000 }).toBe(true);
  });

  test('a radius past the cap is reduced to it rather than accepted', async () => {
    await openGeofenceSettings(page);
    await page.getByRole('button', { name: 'Add location' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('E2E Oversized Area');
    await dialog.getByLabel('Latitude').fill('12.9800');
    await dialog.getByLabel('Longitude').fill('77.6000');
    await dialog.getByLabel(/Radius/).fill('9000');
    await dialog.getByRole('button', { name: 'Add location' }).click();

    // 500 m, not 9000. A fence wide enough to cover the next suburb stops
    // answering the question it was drawn for.
    await expect(page.getByText('E2E Oversized Area')).toBeVisible();
    await expect(page.getByText(/12\.980000, 77\.600000 · 500 m/)).toBeVisible();

    // Remove it again so the remaining tests are judged against HQ alone.
    await page
      .locator('div', { hasText: /^E2E Oversized Area/ })
      .getByRole('button', { name: 'Remove' })
      .first()
      .click();
  });

  test('the employee is told a position will be captured before they press anything', async () => {
    // A page that reaches for a location without warning reads as the app
    // taking something it was not given — and under enforcement they need to
    // know a refusal is coming while they can still walk twenty metres.
    await setMode(page, 'enforced');
    await page.goto('/my-attendance');
    await expect(page.getByTestId('geofence-notice')).toContainText(/checked against/i);
  });

  test('advisory mode says so, and refuses nobody', async () => {
    await setMode(page, 'advisory');
    await resetAttendance(page, employeeId);
    await setFix(page, NEAR_MISS);
    await page.goto('/my-attendance');

    await expect(page.getByTestId('geofence-notice')).toContainText(/not used to refuse/i);

    const card = clockCard(page);
    await card.getByRole('button', { name: /Check In/ }).click();
    // Nowhere near the fence, and the day is marked anyway — that is the whole
    // point of advisory. The verdict is still recorded and still says so.
    await expect(card.getByText(/In \d\d:\d\d/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('geofence-note')).toContainText(/outside its attendance area/i);
  });

  test('an enforced fence refuses a check-in from outside and leaves the day unmarked', async () => {
    await setMode(page, 'enforced');
    await resetAttendance(page, employeeId);
    await setFix(page, NEAR_MISS);
    await page.goto('/my-attendance');

    const card = clockCard(page);
    await card.getByRole('button', { name: /Check In/ }).click();

    // The refusal names the distance and the site, so they know whether walking
    // twenty metres would fix it.
    await expect(card.getByText(/outside its attendance area/i)).toBeVisible({ timeout: 20_000 });

    // And the day is untouched. A refusal that still marks the day is cosmetic.
    await expect(card.getByText('Not checked in yet today.')).toBeVisible();
  });

  test('a check-in from inside the fence is confirmed and marks the day', async () => {
    await setMode(page, 'enforced');
    await resetAttendance(page, employeeId);
    await setFix(page, { lat: HQ.lat + 0.0005, lng: HQ.lng });
    await page.goto('/my-attendance');

    const card = clockCard(page);
    await card.getByRole('button', { name: /Check In/ }).click();

    await expect(page.getByTestId('geofence-note')).toContainText(/Confirmed at/i, {
      timeout: 20_000,
    });
    await expect(card.getByText(/In \d\d:\d\d/)).toBeVisible();
  });

  test('a blocked browser is told what to change, and the day stays unmarked', async () => {
    await setMode(page, 'enforced');
    await resetAttendance(page, employeeId);
    await setDenied(page);
    await page.goto('/my-attendance');

    const card = clockCard(page);
    await card.getByRole('button', { name: /Check In/ }).click();

    // "Blocked for this site" is fixable by the person reading it; "your device
    // could not find a position" is not. They must not produce one sentence.
    await expect(card.getByText(/blocked for this site/i)).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('Not checked in yet today.')).toBeVisible();
  });

  test('mode off captures nothing at all', async () => {
    await setMode(page, 'off');
    await resetAttendance(page, employeeId);
    // Still denied from the previous test, which is the point: with the fence
    // off, a browser that refuses location is irrelevant.
    await page.goto('/my-attendance');

    await expect(page.getByTestId('geofence-notice')).toHaveCount(0);

    const card = clockCard(page);
    await card.getByRole('button', { name: /Check In/ }).click();
    await expect(card.getByText(/In \d\d:\d\d/)).toBeVisible({ timeout: 20_000 });
  });
});
