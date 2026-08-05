import { test, expect, type Page } from '@playwright/test';
import { SUPER_ADMIN } from './config';
import { EMULATOR_HOST, FIRESTORE_BASE, adminToken } from './firestore';

/**
 * Two organisations, two salary structures, no leakage between them.
 *
 * The rules tests prove the server refuses a cross-organisation read of
 * `org_settings/<org>__salaryStructure`. What they cannot show is the thing an
 * administrator would actually see, because it is a property of the client's
 * org-scoped cache and its sign-in-time hydration: that a second organisation
 * starts with **no** structure rather than inheriting ModCon's, that setting
 * one there leaves the first organisation's untouched, and that switching back
 * shows the original figures again.
 *
 * This is the only spec that needs an account able to act across
 * organisations, which is why `SUPER_ADMIN` lives apart from the three role
 * personas — see tests/e2e/config.ts.
 *
 * ## Emulator only, without an opt-in
 *
 * Creating an organisation provisions its first administrator's **Firebase Auth
 * account**. Against the live project that is a real account and a real
 * organisation record, created by a test run, and neither is something the
 * suite can take back. The org-settings project this spec belongs to can be
 * pointed at the live project deliberately (E2E_ORG_SETTINGS_LIVE), so the
 * emulator check here is its own, and it is a skip rather than a failure.
 *
 * `src/lib/organizations.ts` had to be fixed for this to hold: the secondary
 * FirebaseApp it mints the account on was never pointed at the Auth emulator,
 * so an emulated run created that account on live Firebase regardless.
 */
const STAMP = `${Date.now().toString(36)}`;
const NEW_ORG = `E2E Isolation Org ${STAMP}`;
const NEW_ORG_ADMIN = `e2e-org-${STAMP}@modcon-hr.test`;

/** ModCon Builders' own split — the demo organisation's data. */
const DEMO = { basic: 50, hra: 25, medical: 1492, conveyance: 1492 };
/** Deliberately different, so a leak shows up as wrong numbers. */
const OTHER = { basic: 33, hra: 20, medical: 800, conveyance: 600 };

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(SUPER_ADMIN.email);
  await page.locator('#password').fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openSalaryStructure(page: Page) {
  await page.goto('/settings?tab=salary');
  await expect(page.getByRole('heading', { name: 'Salary Structure' })).toBeVisible();
}

async function setStructure(
  page: Page,
  values: { basic: number; hra: number; medical: number; conveyance: number },
) {
  await page.getByLabel('Basic percent').fill(String(values.basic));
  await page.getByLabel('HRA percent').fill(String(values.hra));
  await page.getByLabel('Medical allowance').fill(String(values.medical));
  await page.getByLabel('Conveyance allowance').fill(String(values.conveyance));
  await page.getByRole('button', { name: 'Save Structure' }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 20_000 });
}

async function expectStructure(
  page: Page,
  values: { basic: number; hra: number; medical: number; conveyance: number },
) {
  await expect(page.getByLabel('Basic percent')).toHaveValue(String(values.basic));
  await expect(page.getByLabel('HRA percent')).toHaveValue(String(values.hra));
  await expect(page.getByLabel('Medical allowance')).toHaveValue(String(values.medical));
  await expect(page.getByLabel('Conveyance allowance')).toHaveValue(String(values.conveyance));
}

/** One organisation's stored structure, read straight from Firestore. */
async function publishedFor(orgKey: string): Promise<Record<string, number> | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/org_settings/${orgKey}__salaryStructure`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw) as Record<string, number> | null;
}

test.describe.serial('a second organisation shares no salary structure with the first', () => {
  let page: Page;
  let newOrgId = '';

  test.skip(
    !EMULATOR_HOST,
    'creates an organisation and a Firebase Auth account — emulator only, never the live project',
  );

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
    // The demo organisation's own split, so "unchanged at the end" means
    // something specific rather than whatever a previous run left behind.
    await openSalaryStructure(page);
    await setStructure(page, DEMO);
  });

  test.afterAll(async () => {
    try {
      // Leave the browser managing the demo organisation again: the org key is
      // per-browser and every other spec assumes the default.
      await page.goto('/organizations');
      const back = page.getByRole('button', { name: 'Switch back to Default' });
      if (await back.count()) {
        await back.click();
        await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();
      }
    } finally {
      await page?.close();
    }
  });

  test('a super admin creates a second organisation', async () => {
    await page.goto('/organizations');
    await page.getByRole('button', { name: 'Create Organization' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Acme Builders').fill(NEW_ORG);
    await dialog.getByPlaceholder('Jane Doe').fill('E2E Org Admin');
    await dialog.getByPlaceholder('hr@acme.com').fill(NEW_ORG_ADMIN);
    await dialog.getByRole('button', { name: 'Create' }).click();

    // Provisioning mints an Auth account, so this is slower than a Firestore write.
    await expect(dialog.getByText('Organization created')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();
    // The row, not any text node: the dialog is still fading out and carries
    // the same name, so an unscoped match resolves to the hidden copy.
    await expect(page.getByRole('row', { name: new RegExp(NEW_ORG) })).toBeVisible();
  });

  test('the new organisation inherits no salary structure', async () => {
    // The assertion this whole spec exists for. A fresh organisation showing
    // Basic 50% / HRA 25% would be showing it ModCon Builders' compensation
    // policy as its own.
    await page.getByRole('row', { name: new RegExp(NEW_ORG) }).getByRole('button', { name: 'Manage this org' }).click();
    // Switching reloads the app so every org-scoped module re-evaluates. The
    // new organisation's own row is what says it is the one being managed —
    // the stat card carries the same words, hence the row scope.
    await expect(
      page.getByRole('row', { name: new RegExp(NEW_ORG) }).getByRole('button', { name: 'Currently managing' }),
    ).toBeVisible({ timeout: 20_000 });
    newOrgId = await page.evaluate(() => localStorage.getItem('modcon.hr.superAdminSelectedOrg') ?? '');
    expect(newOrgId, 'the browser did not switch organisation').not.toBe('');
    expect(newOrgId).not.toBe('default');

    await openSalaryStructure(page);
    await expect(page.getByTestId('salary-structure-unset')).toBeVisible();
    await expect(page.getByLabel('Basic percent')).toHaveValue('');
    await expect(page.getByLabel('HRA percent')).toHaveValue('');
    await expect(page.getByLabel('Medical allowance')).toHaveValue('');
    await expect(page.getByLabel('Conveyance allowance')).toHaveValue('');
  });

  test("its own structure is stored separately from the first organisation's", async () => {
    await openSalaryStructure(page);
    await setStructure(page, OTHER);

    // Two documents, two different splits — not one document being rewritten.
    expect(await publishedFor(newOrgId)).toMatchObject({
      basicPercent: OTHER.basic,
      hraPercent: OTHER.hra,
      medicalAllowance: OTHER.medical,
      conveyanceAllowance: OTHER.conveyance,
    });
    expect(await publishedFor('default')).toMatchObject({
      basicPercent: DEMO.basic,
      hraPercent: DEMO.hra,
      medicalAllowance: DEMO.medical,
      conveyanceAllowance: DEMO.conveyance,
    });
  });

  test('switching back shows the first organisation its own figures, unchanged', async () => {
    await page.goto('/organizations');
    await page.getByRole('button', { name: 'Switch back to Default' }).click();
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible({ timeout: 20_000 });

    await openSalaryStructure(page);
    await expectStructure(page, DEMO);
  });
});
