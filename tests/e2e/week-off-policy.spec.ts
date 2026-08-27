import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * A week-off has two levels, and the narrower one wins.
 *
 * There used to be one. `weekOffOf` ended `?? 'Sunday'`, so the organisation's
 * policy was a literal in the platform: a company closed on Friday could only
 * express it by setting a personal week-off on every employee, one at a time,
 * and every new joiner silently reverted to Sunday. The organisation's half now
 * lives in `org_settings` (Settings → Week Off) and the personal half goes on
 * overriding it.
 *
 * Both directions are asserted, because either alone is satisfied by a rule
 * that is wrong in the other:
 *
 *   - somebody with no day of their own follows the organisation, and moves
 *     when it moves;
 *   - somebody with a day of their own does not move at all.
 *
 * The day chosen here is **Wednesday**, which no seeded employee has. Seeded
 * personal week-offs are Sunday, Monday or Tuesday (see tests/e2e/clock.ts), so
 * a policy set to one of those would be indistinguishable from the override it
 * is supposed to be overridden by.
 *
 * Runs in the org-settings project: it writes the organisation's shared
 * configuration and restores the previous value.
 */

const ADMIN = PERSONAS.admin;

/** Seeded with no `weekOff` of their own — follows the organisation. */
const FOLLOWS_ORG = 'Diya Mehta';
/** Seeded with `weekOff: 'Monday'` — overrides the organisation. */
const HAS_OWN = 'Aarav Sharma';
const HAS_OWN_DAY = 'Monday';

const POLICY_DAY = 'Wednesday';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** The organisation's copy, which is the one that outlives this browser. */
async function storedWeekOff(): Promise<string | null> {
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}/org_settings/default__weekOff`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  // `publishOrgSetting` stores the whole setting as a JSON string in
  // `valueJson`, so a week-off arrives here as the six characters `"Sunday"`
  // rather than as a Firestore string field.
  const body = (await res.json()) as { fields?: { valueJson?: { stringValue?: string } } };
  const raw = body.fields?.valueJson?.stringValue;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

async function openWeekOffSettings(page: Page) {
  await page.goto('/settings?tab=weekoff');
  await expect(page.getByRole('heading', { name: 'Week Off' })).toBeVisible({ timeout: 20_000 });
}

/** The profile's Week Off row, which names which level the day came from. */
async function weekOffRowFor(page: Page, fullName: string): Promise<string> {
  await page.goto('/employees');
  await page.getByText(fullName, { exact: true }).first().click();
  const row = page.getByText(/·\s(their own|organisation's)$/).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  return (await row.innerText()).trim();
}

test.describe.serial("week off is the organisation's, and one person's overrides it", () => {
  let context: BrowserContext;
  let page: Page;
  let previous: string | null = null;

  test.beforeAll(async ({ browser }) => {
    previous = await storedWeekOff();
    context = await browser.newContext();
    page = await context.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    // Restored through the UI rather than by REST, so the localStorage cache
    // this browser reads is put back too. `previous` is null on a first run —
    // the organisation had declared nothing, and there is no way to un-declare
    // it from here, so it is left on the fallback day it resolved to anyway.
    if (page && !page.isClosed()) {
      try {
        await openWeekOffSettings(page);
        await page.getByLabel('Organisation week off').selectOption(previous ?? 'Sunday');
        await expect.poll(storedWeekOff, { timeout: 15_000 }).toBe(previous ?? 'Sunday');
      } catch {
        // Best effort — a failure here must not mask the failure that caused it.
      }
    }
    await context?.close();
  });

  test('the organisation can declare a week off, and it reaches its own copy', async () => {
    await openWeekOffSettings(page);
    await page.getByLabel('Organisation week off').selectOption(POLICY_DAY);

    // Asserted against Firestore, not the page: the point of the setting is
    // that it outlives the browser that made it, which re-reading the same
    // select cannot show.
    await expect.poll(storedWeekOff, { timeout: 15_000 }).toBe(POLICY_DAY);
  });

  test('somebody with no day of their own follows it', async () => {
    expect(await weekOffRowFor(page, FOLLOWS_ORG)).toContain(`${POLICY_DAY} · organisation's`);
  });

  test('somebody with a day of their own overrides it', async () => {
    const row = await weekOffRowFor(page, HAS_OWN);
    expect(row).toContain(`${HAS_OWN_DAY} · their own`);
    // The assertion the whole rule is about: the policy moved and this person
    // did not move with it.
    expect(row).not.toContain(POLICY_DAY);
  });

  test('Settings names everybody the policy does not reach', async () => {
    await openWeekOffSettings(page);
    // An administrator changing the company's week-off is entitled to know
    // which people it will not move, rather than discovering it from a roster
    // that disagrees with the policy that supposedly produced it.
    await expect(page.getByText(HAS_OWN, { exact: true })).toBeVisible();
    await expect(page.getByText(FOLLOWS_ORG, { exact: true })).toHaveCount(0);
  });
});
