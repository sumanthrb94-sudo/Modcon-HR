import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * Statutory payroll: nothing is withheld until the organisation says so, and
 * everything is once it does.
 *
 * The arithmetic — EPF, ESI, professional tax, TDS, gratuity, the Code on Wages
 * floor — lives in `src/data/statutoryRules.ts`, imports nothing, and is
 * covered exhaustively by `tests/unit/statutoryRules.test.ts`. That is where a
 * rate is checked. This spec covers the half a unit test cannot reach: that the
 * declaration in Settings actually reaches the organisation's Firestore copy,
 * and that a payslip changes when it does.
 *
 * ## Why this is in the org-settings project
 *
 * It writes `org_settings/default__statutoryConfig`, which every payslip in the
 * deployment is then computed against — the same shared-configuration hazard as
 * the salary structure, and handled the same way: one file, one engine, one
 * `describe.serial`, and the document restored to its pre-run state at both
 * ends.
 *
 * **Restoring matters more here than anywhere else on this page.** A statutory
 * configuration left behind does not look like a fake: it looks like an
 * organisation that deducts provident fund, and every other spec's payslip
 * figures move underneath it.
 */
const ADMIN = PERSONAS.admin;
const CONFIG_DOC = 'org_settings/default__statutoryConfig';

const EPF_CODE = 'KN/BNG/E2E00001/000';
/** A well-paid seed employee, so the Basic clears the PF wage ceiling. */
const SUBJECT = 'Aarav Sharma';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** What the organisation's Firestore copy holds, not what the page shows. */
async function publishedConfig(): Promise<Record<string, unknown> | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${CONFIG_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  if (typeof raw !== 'string') return null;
  return JSON.parse(raw) as Record<string, unknown> | null;
}

/** Put the document back exactly as it was found, including "absent". */
async function restoreConfig(snapshot: string | null) {
  const token = await adminToken();
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (snapshot === null) {
    await fetch(`${FIRESTORE_BASE}/${CONFIG_DOC}`, { method: 'DELETE', headers });
    return;
  }
  await fetch(`${FIRESTORE_BASE}/${CONFIG_DOC}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      fields: {
        key: { stringValue: 'statutoryConfig' },
        orgId: { stringValue: 'default' },
        valueJson: { stringValue: snapshot },
      },
    }),
  });
}

/**
 * The Compensation tab of one employee's profile.
 *
 * The subject is named rather than "whoever the first row is": the statutory
 * assertions below are about a person whose Basic is over the ₹15,000 ceiling,
 * and a directory that reorders would otherwise land the test on somebody
 * whose contribution is a different figure entirely.
 */
async function openCompensation(page: Page) {
  await page.goto('/employees');
  await page.getByPlaceholder('Search name, role, email, code…').fill(SUBJECT);
  await page.getByText(SUBJECT).first().click();
  await page.getByRole('button', { name: 'Compensation' }).click();
  await expect(page.getByTestId('monthly-gross')).toBeVisible({ timeout: 20_000 });
}

async function openCompliance(page: Page) {
  await page.goto('/settings?tab=statutory');
  await expect(page.getByRole('heading', { name: 'Payroll Compliance' })).toBeVisible();
}

test.describe.serial('statutory payroll', () => {
  let page: Page;
  /** The organisation's copy as found, so the run leaves nothing behind. */
  let snapshot: string | null = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);

    const token = await adminToken();
    if (token) {
      const res = await fetch(`${FIRESTORE_BASE}/${CONFIG_DOC}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200) {
        const raw = (await res.json()).fields?.valueJson?.stringValue;
        snapshot = typeof raw === 'string' ? raw : null;
      }
    }
  });

  test.afterAll(async () => {
    await restoreConfig(snapshot);
    await page?.close();
  });

  test('an organisation that has declared nothing withholds nothing', async () => {
    await restoreConfig(null);
    await openCompliance(page);
    await page.reload();

    // The page says so rather than showing four switched-off schemes with no
    // explanation of what that costs.
    await expect(page.getByText('Nothing is set up yet.')).toBeVisible();
    await expect(
      page.getByText(/no professional tax and no tax deducted at source/),
    ).toBeVisible();
  });

  test('a scheme will not switch on without somewhere to remit to', async () => {
    await openCompliance(page);
    await page
      .getByLabel('This establishment is covered by the EPF Act')
      .check();
    await page.getByRole('button', { name: 'Save' }).click();

    // Refused, and said out loud. A deduction with no establishment code is
    // money taken from somebody with nowhere to send it, which is worse than
    // no deduction — so this is a refusal rather than a toggle that silently
    // will not stay on.
    await expect(page.getByText(/EPF needs the establishment code/)).toBeVisible();
    expect(await publishedConfig()).toBeNull();
  });

  test('declaring EPF reaches the organisation', async () => {
    await openCompliance(page);
    await page.getByLabel('This establishment is covered by the EPF Act').check();
    await page.getByPlaceholder('e.g. KN/BNG/0012345/000').fill(EPF_CODE);
    // On top of the CTC, so this spec's assertion is about the deduction and
    // not about gross moving underneath it as well.
    await page.getByLabel("Where the employer's share sits").selectOption(
      { label: 'On top of the CTC — gross stays CTC ÷ 12' },
    );
    await page.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(async () => {
        const config = await publishedConfig();
        return (config?.epf as { enabled?: boolean; establishmentCode?: string })?.establishmentCode;
      }, { timeout: 20_000 })
      .toBe(EPF_CODE);

    const config = await publishedConfig();
    expect((config?.epf as { enabled?: boolean }).enabled).toBe(true);
    // Everything else stays off. Switching one scheme on must not switch on the
    // three beside it, which would deduct under Acts nobody declared.
    expect((config?.esi as { enabled?: boolean }).enabled).toBe(false);
    expect((config?.incomeTax as { enabled?: boolean }).enabled).toBe(false);
  });

  test('the declaration reaches a payslip', async () => {
    // Asserted on the profile's Compensation tab, which computes live rather
    // than reading a stored payslip — a stored payslip is a record of what was
    // paid and deliberately does not follow a settings change.
    await openCompensation(page);

    // The employee's own share is withheld...
    await expect(page.getByText('Provident Fund (employee)')).toBeVisible({ timeout: 20_000 });
    // ...and the employer's is shown separately, because it is not a deduction.
    // Listed together, a payslip appears to take twice what it does.
    await expect(page.getByText('Paid by the employer')).toBeVisible();
    await expect(page.getByText('Pension (EPS)')).toBeVisible();
  });

  test('withdrawing the declaration withholds nothing again', async () => {
    await openCompliance(page);
    await page.getByLabel('This establishment is covered by the EPF Act').uncheck();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(async () => {
        const config = await publishedConfig();
        return (config?.epf as { enabled?: boolean })?.enabled;
      }, { timeout: 20_000 })
      .toBe(false);

    await openCompensation(page);
    // Gone entirely rather than showing ₹0. A card of zeroes reads as
    // contributions that were calculated and came to nothing, which is a
    // different statement from an organisation that runs no scheme.
    await expect(page.getByText('Provident Fund (employee)')).toHaveCount(0);
  });
});
