import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';

/**
 * An employee whose leave entitlement is not the organisation's own.
 *
 * The organisation's policy list answers "what does this company grant"; it
 * could not answer "and what did we agree with this person" — a negotiated
 * Earned Leave, a cohort of interns on half the casual quota. Those arrive as a
 * list from HR, so they are uploaded as a CSV and stored beside the policy list
 * in `org_settings` (data/leavePolicies.ts), and `getLeavePoliciesFor` is what
 * every balance in the app is derived through.
 *
 * ## What this asserts, and where
 *
 * The upload is only half of it. A per-employee quota that Settings displays and
 * the Leave module ignores is worse than no feature at all — the organisation
 * would believe it had granted something it is not accruing — so this walks the
 * figure the whole way: uploaded here, published to the organisation's Firestore
 * copy, and read back off the employee's own balance card on /leave.
 *
 * It asserts against Firestore rather than the page for the storage half. The
 * page renders the localStorage cache, which is written before the publish and
 * survives it failing; only the organisation's copy proves the exception reached
 * anyone but this browser.
 *
 * ## Why it is in the org-settings project
 *
 * It writes a **shared** organisation document. Run once, on one engine: three
 * engines are three concurrent whole-document writers, and this is app logic
 * rather than engine behaviour. `restoreOverrides` is what keeps the run from
 * leaving a fake entitlement in the organisation's configuration — see its
 * comment.
 */

const OVERRIDES_DOC = 'org_settings/default__employeeLeavePolicies';

/** A seeded employee with more than a year of service, so the Earned gate is met. */
const SUBJECT_CODE = 'MC-090';
const SUBJECT_NAME = 'Riya Sharma';
/** Not the organisation's 15, and not a number the demo dataset already uses. */
const CUSTOM_EARNED_DAYS = 21;

const UPLOAD = [
  'employee_code,leave_type,annual_days,monthly_accrual,min_tenure_months',
  // Applied: Earned Leave is granted for the year, so the annual column is the
  // one it accrues by. The blank tenure cell leaves the organisation's gate
  // alone — the point of a sparse override.
  `${SUBJECT_CODE},Earned Leave,${CUSTOM_EARNED_DAYS},,`,
  // Refused, not converted: Casual accrues a day a month, and reading "12 a
  // year" as "one a month" would be this app inventing an accrual pattern
  // nobody typed. Twelve days available in April is not the same promise.
  `${SUBJECT_CODE},Casual Leave,12,,`,
  // Refused: nobody in this organisation carries that code.
  'MC-999,Sick Leave,,2,',
].join('\n');

/**
 * The exceptions as **Firestore** holds them, not as the browser renders them.
 *
 * Null when the organisation's copy cannot be read at all (sign-in refused, or
 * nothing published yet), which callers must not confuse with "there are none".
 */
async function publishedOverrides(): Promise<Record<string, unknown> | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${OVERRIDES_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Whatever the organisation held before this suite ran, or null if nothing. */
let beforeSuite: string | null = null;

async function captureOverrides() {
  const token = await adminToken();
  if (!token) return;
  const res = await fetch(`${FIRESTORE_BASE}/${OVERRIDES_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  beforeSuite = res.status === 200
    ? ((await res.json()).fields?.valueJson?.stringValue ?? null)
    : null;
}

/**
 * Put the organisation's exceptions back exactly as they were.
 *
 * Necessary because this is the organisation's real configuration: a run that
 * does not clean up leaves someone accruing 21 days of Earned Leave they were
 * never granted, and a fake entitlement is not visible as a fake on the Leave
 * page — it simply looks like the balance.
 *
 * A snapshot restore rather than the read-modify-write `org-settings.spec.ts`
 * uses, because unlike the policy list this document has exactly one writer in
 * the app and the window is one suite long; the trade — an exception a human
 * uploaded during that window is undone — is the narrower risk of the two here,
 * where the alternative needs the employee id, which this spec deliberately
 * never hardcodes (`emp-*` is a seed-order sequence).
 *
 * Runs before the suite as well as after: an interrupted run never reaches the
 * afterAll, and a sign-in that fails returns silently by design, so leftovers
 * would otherwise accumulate one per run.
 */
async function restoreOverrides() {
  const token = await adminToken();
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // All three fields, not just the value. This call *creates* the document on a
  // deployment that has never had an exception, and `firestore.rules` requires
  // an org_settings document to carry the `orgId` and `key` its id is built
  // from — a document holding only `valueJson` is one the rules then refuse
  // every app write to, which is a suite that breaks the feature it tests.
  const mask = 'updateMask.fieldPaths=orgId&updateMask.fieldPaths=key&updateMask.fieldPaths=valueJson';
  await fetch(`${FIRESTORE_BASE}/${OVERRIDES_DOC}?${mask}`, {
    method: 'PATCH',
    headers,
    // '{}' rather than deleting the document: the sync leaves a missing
    // document's local value alone, so a delete would leave the uploaded
    // exception in every browser that had already cached it.
    body: JSON.stringify({
      fields: {
        orgId: { stringValue: 'default' },
        key: { stringValue: 'employeeLeavePolicies' },
        valueJson: { stringValue: beforeSuite ?? '{}' },
      },
    }),
  });
}

async function signIn(page: Page, persona: typeof PERSONAS.admin) {
  await page.goto('/login');
  await page.locator('#username').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openLeaveSettings(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Leave Policies' }).click();
}

async function openBalancesFor(page: Page, name: string) {
  await page.goto('/leave');
  await page.getByRole('button', { name: 'Leave Balances' }).click();
  await page.getByPlaceholder('Search name, code or department…').fill(name);
}

test.describe.serial('per-employee leave entitlement', () => {
  test.beforeAll(async () => {
    await captureOverrides();
    await restoreOverrides();
  });
  test.afterAll(restoreOverrides);

  test('HR uploads a custom entitlement, and the balance is computed from it', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, PERSONAS.admin);
    await openLeaveSettings(page);

    await page.getByLabel('Employee leave entitlements CSV').setInputFiles({
      name: 'entitlements.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UPLOAD, 'utf8'),
    });

    // Nothing is written by the upload itself: the review list is the whole
    // point of a file that names people by a code somebody typed.
    await expect(page.getByTestId('leave-policy-csv-matched-count')).toHaveText('1');
    await expect(page.getByTestId('leave-policy-csv-match')).toHaveAttribute(
      'data-employee-code',
      SUBJECT_CODE,
    );
    // Reported, never dropped — a row silently ignored looks exactly like a row
    // applied, which is why this file has three rows and not one.
    await expect(page.getByTestId('leave-policy-csv-unmatched-count')).toHaveText('2');
    await expect(page.getByText('accrues month by month')).toBeVisible();
    await expect(page.getByText('No employee with code MC-999')).toBeVisible();

    await page.getByRole('button', { name: /Save 1 entitlement/ }).click();

    const override = page.getByTestId('leave-policy-override');
    await expect(override).toHaveCount(1);
    await expect(override).toContainText(SUBJECT_NAME);
    await expect(override).toContainText(`${CUSTOM_EARNED_DAYS} days/year`);

    // The organisation's copy, not this browser's. Until this lands the
    // exception exists on one laptop, which is the whole reason it is an
    // org_setting rather than a localStorage key.
    await expect.poll(async () => {
      const published = await publishedOverrides();
      if (!published) return null;
      const entries = Object.entries(published);
      if (entries.length !== 1) return null;
      return (entries[0][1] as Record<string, { annual?: number }>).Earned?.annual ?? null;
    }, { timeout: 20_000 }).toBe(CUSTOM_EARNED_DAYS);

    // The half that matters. A quota Settings displays and the Leave module
    // ignores would leave the organisation believing it had granted something
    // it is not accruing.
    await openBalancesFor(page, SUBJECT_NAME);
    const earned = page.locator('[data-testid="leave-balance-row"][data-leave-type="Earned"]');
    // `${available}/${granted}` — the grant is the assertion; how much of it is
    // still available depends on what the seed has this person taking.
    await expect(earned.first()).toHaveAttribute(
      'data-leave-reading',
      new RegExp(`/${CUSTOM_EARNED_DAYS}$`),
    );
    // Said out loud on the surface that shows the figure: an unexplained
    // difference from the policy in Settings reads as a defect in the accrual.
    await expect(page.getByTestId('custom-entitlement')).toHaveCount(1);

    await page.screenshot({ path: 'test-results/employee-leave-policy.png', fullPage: true });
    await context.close();
  });

  test('removing the exception puts the employee back on the organisation\'s policy', async ({ browser }) => {
    // Back onto the organisation's quota, never onto nothing — which is what
    // distinguishes removing an individual's exception from clearing a policy.
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, PERSONAS.admin);
    await openLeaveSettings(page);

    await page.getByRole('button', { name: `Remove custom entitlement for ${SUBJECT_NAME}` }).click();
    await expect(page.getByTestId('leave-policy-override')).toHaveCount(0);

    await openBalancesFor(page, SUBJECT_NAME);
    const earned = page.locator('[data-testid="leave-balance-row"][data-leave-type="Earned"]');
    // 15 is the organisation's own Earned Leave grant, from the seeded policy.
    await expect(earned.first()).toHaveAttribute('data-leave-reading', /\/15$/);
    await expect(page.getByTestId('custom-entitlement')).toHaveCount(0);

    await context.close();
  });
});
