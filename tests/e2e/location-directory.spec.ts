import { test, expect, type Page } from '@playwright/test';
import { HR_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * A location HR adds belongs to the organisation, not to their browser.
 *
 * The dropdown always appeared to work: pick "+ Add new location", type one,
 * save, and there it is. But the list was derived from the employee directory,
 * which is localStorage — so the new office existed in exactly one browser, and
 * only for as long as somebody was posted there. The colleague at the next desk
 * opened the same form and was offered the old list.
 *
 * What that means for a test: reloading the page proves nothing, because the
 * cache reloads with it. The claim is about the organisation's Firestore copy,
 * so this reads that copy directly, then reads the list back from a browser
 * with no localStorage of its own.
 *
 * Runs in the org-settings project. It writes `org_settings/<org>__customLocations`,
 * which is shared configuration — the same reason salary-structure.spec.ts is
 * there, and it restores what it added.
 */
const NEW_LOCATION = 'E2E Kochi';
const RENAMED_LOCATION = 'E2E Kochi Central';
const EMPTY_LOCATION = 'E2E Nowhere';
const SETTING_DOC = 'org_settings/default__customLocations';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(HR_PERSONA.email);
  await page.locator('#password').fill(HR_PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openAddEmployee(page: Page) {
  await page.goto('/employees');
  await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add Employee' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** What the organisation's Firestore copy holds, not what this browser cached. */
async function publishedLocations(): Promise<string[] | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${SETTING_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  return typeof raw === 'string' ? (JSON.parse(raw) as string[]) : null;
}

test.describe.serial('a work location belongs to the organisation', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    // Every other browser in the deployment hydrates this list at sign-in, so
    // leaving the fake behind puts it in an administrator's dropdown for good.
    try {
      await page.evaluate(() => window.localStorage.removeItem('modcon.hr.customLocations'));
      const token = await adminToken();
      if (token) {
        await fetch(`${FIRESTORE_BASE}/${SETTING_DOC}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } finally {
      await page?.close();
    }
  });

  test('HR adds one while hiring, and it reaches the organisation', async () => {
    const dialog = await openAddEmployee(page);
    await dialog.getByLabel('Employee first name').fill('Location');
    await dialog.getByLabel('Employee last name').fill('Pioneer');
    await dialog.getByLabel('Employee email').fill('location.pioneer@modcon.io');
    await dialog.getByLabel('Employee designation').fill('Software Engineer');
    await dialog.getByLabel('Employee date of birth').fill('1995-04-12');
    await dialog.getByLabel('Employee date of joining').fill('2021-04-01');
    await dialog.getByLabel('Employee ctc').fill('1800000');
    await dialog.getByLabel('Employee location').selectOption('__create__');
    await dialog.getByLabel('New employee location').fill(NEW_LOCATION);
    await dialog.getByRole('button', { name: 'Save Employee' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(async () => await publishedLocations(), {
        message: 'the location never reached the organisation',
        timeout: 20_000,
      })
      .toContain(NEW_LOCATION);
  });

  test('a browser that has never seen it is offered it too', async ({ browser }) => {
    // The point of the whole change, and both halves of it at once. This
    // context has no localStorage: it is a second administrator hydrating the
    // list from Firestore at sign-in, and it is also a browser where *nobody*
    // is posted at the new location, since the employee above exists only in
    // the other context's directory. A derived list would offer neither.
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    try {
      await login(other);
      const dialog = await openAddEmployee(other);
      await expect
        .poll(async () => await dialog.getByLabel('Employee location').locator('option').allTextContents(), {
          message: 'the second browser never hydrated the organisation’s locations',
          timeout: 20_000,
        })
        .toContain(NEW_LOCATION);
    } finally {
      await other.close();
      await fresh.close();
    }
  });

  test('Settings lists it, and renaming it takes its people along', async () => {
    await page.goto('/settings?tab=locations');
    await expect(page.getByRole('heading', { name: 'Locations' })).toBeVisible({ timeout: 20_000 });

    const row = page.getByRole('row', { name: new RegExp(NEW_LOCATION) });
    await expect(row).toBeVisible();
    // Declared, not merely inferred from the employee posted there — the
    // distinction is what decides whether it can be renamed at all.
    await expect(row).toContainText('Declared');
    await expect(row).toContainText('1');

    await row.getByRole('button', { name: 'Rename' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Location name').fill(RENAMED_LOCATION);
    await dialog.getByRole('button', { name: 'Save Location' }).click();
    await expect(dialog).toBeHidden();
    // The rename is only real if the person moved with it. Left behind, they
    // would sit at a name the organisation no longer offers.
    await expect(page.getByRole('status')).toContainText('moved 1 person');

    await expect
      .poll(async () => await publishedLocations(), { timeout: 20_000 })
      .toContain(RENAMED_LOCATION);
    expect(await publishedLocations()).not.toContain(NEW_LOCATION);
  });

  test('a location with people in it cannot be withdrawn', async () => {
    const row = page.getByRole('row', { name: new RegExp(RENAMED_LOCATION) });
    await row.getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByRole('status')).toContainText('posted at');
    // Refused, not merely warned about: it is still offered.
    await expect(await publishedLocations()).toContain(RENAMED_LOCATION);
  });

  test('an unoccupied one is withdrawn, and stops being offered', async () => {
    await page.goto('/settings?tab=locations');
    await expect(page.getByRole('heading', { name: 'Locations' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Add Location' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('New location name').fill(EMPTY_LOCATION);
    await dialog.getByRole('button', { name: 'Add Location' }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole('row', { name: new RegExp(EMPTY_LOCATION) });
    await expect(row).toContainText('Declared');
    await row.getByRole('button', { name: 'Withdraw' }).click();

    await expect
      .poll(async () => (await publishedLocations()) ?? [], { timeout: 20_000 })
      .not.toContain(EMPTY_LOCATION);
  });
});
