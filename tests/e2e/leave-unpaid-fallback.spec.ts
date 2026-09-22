import { test, expect, type Page } from '@playwright/test';
import { PERSONAS, UNPAID_FALLBACK_PERSONA } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * Leave has to stay usable year-round, whatever the organisation configured.
 *
 * QA raised it against a real organisation: the Leave Type dropdown offered
 * only "Earned — 0 of 1 available", nothing else. Casual, Sick and Unpaid
 * were all absent, so an employee who had used or not yet qualified for their
 * one paid type had no way to file leave at all — not even to say "I will be
 * out and unpaid for it".
 *
 * CLAUDE.md is explicit, repeatedly, that a plausible default is worse than
 * none: the holiday calendar, the salary structure and the statutory schemes
 * all show "not set" rather than inventing a figure nobody at the
 * organisation chose, because a default is indistinguishable from a decision
 * the organisation made. Seeding Casual/Sick/Unpaid into every organisation's
 * policy list would be exactly that — an entitlement (how many days, on what
 * accrual, gated by what tenure) presented as though HR had configured it.
 *
 * So the fix is not a default entitlement. It is a structural fallback that
 * is not an entitlement at all: `getApplicableEntitlements`
 * (src/data/leaveEntitlements.ts) now guarantees an "Unpaid" option whenever
 * the organisation has not named one of its own, granting zero days, accruing
 * nothing, never written to `org_settings`, and never offered in Settings as
 * something HR chose. It is the same "record it, don't deduct it" behaviour
 * `carriesNoBalance` already gives a configured Unpaid Leave policy — this
 * only guarantees one such type always exists to apply under.
 *
 * This runs against an organisation restricted to a single, tenure-gated
 * Earned Leave policy — Casual, Sick and Unpaid all absent, and the fresh
 * employee under test not yet tenured enough for Earned either, so every
 * configured type reads unavailable. Unpaid Leave still has to appear, and a
 * request under it still has to submit.
 *
 * In the org-settings project: it rewrites the organisation's shared leave
 * policy list and restores it at both ends, the same convention
 * employee-leave-policy.spec.ts and week-off-policy.spec.ts use for the
 * documents they own.
 */

const ADMIN = PERSONAS.admin;
const EMPLOYEE = UNPAID_FALLBACK_PERSONA;
const POLICIES_DOC = 'org_settings/default__leavePolicies';
const EMPLOYEE_CODE = 'MC-9502';

/** A single Earned Leave policy, gated past a year of service on purpose — see above. */
const EARNED_ONLY_POLICY = [
  {
    id: 'lp-unpaid-fallback-test',
    type: 'Earned Leave',
    annual: 15,
    accrual: 'annual',
    monthlyAccrual: 0,
    carryForward: true,
    carryForwardBeyondYear: true,
    encashment: true,
    halfDay: true,
    minTenureMonths: 12,
    applicable: 'All employees',
  },
];

/** Whatever the organisation's leave policy held before this suite ran. */
let beforeSuite: string | null = null;

async function readPolicies(): Promise<string | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${POLICIES_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  return (await res.json()).fields?.valueJson?.stringValue ?? null;
}

/** Write the organisation's leave policy list, all three required fields at once. */
async function writePolicies(valueJson: string) {
  const token = await adminToken();
  if (!token) return;
  const mask = 'updateMask.fieldPaths=orgId&updateMask.fieldPaths=key&updateMask.fieldPaths=valueJson';
  await fetch(`${FIRESTORE_BASE}/${POLICIES_DOC}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        orgId: { stringValue: 'default' },
        key: { stringValue: 'leavePolicies' },
        valueJson: { stringValue: valueJson },
      },
    }),
  });
}

/** Put the organisation's real policy list back, whatever this run did to it. */
async function restorePolicies() {
  // '[]' rather than deleting the document on a deployment that never had one:
  // deleting would leave the sync's cached copy in every browser that already
  // read it, the same reasoning employee-leave-policy.spec.ts's
  // restoreOverrides applies to its own document.
  await writePolicies(beforeSuite ?? '[]');
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('leave stays usable when the organisation has configured almost none', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    beforeSuite = await readPolicies();
    await writePolicies(JSON.stringify(EARNED_ONLY_POLICY));

    page = await browser.newPage();
    await login(page, ADMIN.email, ADMIN.password);
    await page.getByRole('link', { name: 'Employees', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add Employee' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Employee code').fill(EMPLOYEE_CODE);
    await dialog.getByLabel('Employee first name').fill('Playwright');
    await dialog.getByLabel('Employee last name').fill('Fallback');
    await dialog.getByLabel('Employee email').fill(EMPLOYEE.email);
    await dialog.getByLabel('Employee designation').fill('Support Engineer');
    await dialog.getByLabel('Employee date of birth').fill('1996-02-20');
    // Joined today, on purpose: under a policy gated at 12 months of service,
    // this employee qualifies for none of it — the case the dropdown used to
    // leave with nothing to offer.
    const today = new Date().toISOString().slice(0, 10);
    await dialog.getByLabel('Employee date of joining').fill(today);
    await dialog.getByLabel('Employee ctc').fill('900000');
    await dialog.getByRole('button', { name: 'Save Employee' }).click();
    await expect(dialog).toBeHidden();

    await page.locator('button[title="Sign out"]').click();
    await expect(page.locator('#username')).toBeVisible({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    await page?.close();
    await restorePolicies();
  });

  test('Unpaid still appears, and no accrued balance, when nothing else does', async () => {
    await login(page, EMPLOYEE.email, EMPLOYEE.password);
    await page.getByRole('link', { name: 'Leave', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Leave Management' })).toBeVisible();
    await page.getByRole('button', { name: 'Apply Leave' }).click();

    const dialog = page.getByRole('dialog');
    const typeSelect = dialog.locator('select').first();
    await expect(typeSelect).toBeVisible();

    const optionTexts = await typeSelect.locator('option').allTextContents();
    // The organisation configured exactly one type, and it does not apply to
    // this employee yet — Casual and Sick were never configured at all.
    expect(optionTexts.some((t) => t.startsWith('Casual'))).toBe(false);
    expect(optionTexts.some((t) => t.startsWith('Sick'))).toBe(false);
    expect(optionTexts.some((t) => /^Earned — available after 1 year of service$/.test(t))).toBe(true);
    // The fallback: present, unmistakably not an accrued entitlement.
    expect(optionTexts.some((t) => t === 'Unpaid — no accrued balance')).toBe(true);

    await typeSelect.selectOption('Unpaid');
    await expect(dialog.getByText('No accrued balance')).toBeVisible();

    // A working day far enough out to be free of holidays, week-offs and any
    // existing request — this employee has none, so the first candidate that
    // is not a holiday or this employee's week-off will do.
    let picked = false;
    for (let offset = 3; offset < 20 && !picked; offset += 1) {
      const day = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      await dialog.locator('input[type="date"]').first().fill(day);
      await dialog.locator('input[type="date"]').nth(1).fill(day);
      const submit = dialog.getByRole('button', { name: 'Submit Request' });
      if (await submit.isEnabled()) picked = true;
    }
    expect(picked).toBe(true);

    await dialog.getByPlaceholder('Briefly describe the reason for leave…').fill('Unpaid — exhausted every configured type.');
    await dialog.getByRole('button', { name: 'Submit Request' }).click();
    await expect(dialog).toBeHidden();

    // Filed, not merely accepted by the form: the request now exists on the
    // Requests tab, against this employee, at the type the fallback offered.
    const row = page.locator('tr', { has: page.getByText('Playwright Fallback') }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText('Unpaid', { exact: true })).toBeVisible();
  });
});
