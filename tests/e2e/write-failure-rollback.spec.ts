import { test, expect } from '@playwright/test';
import { type Persona } from './config';
import { seedOrgRecords } from './firestore';

/**
 * A change the server refused does not stay on screen.
 *
 * Writes to `org_records` are optimistic by design: `save()` writes the
 * localStorage cache, fires its change event and returns, and the commit
 * follows without being awaited. A decision should not wait on a round trip.
 *
 * What was not by design is what used to happen when that commit FAILED. The
 * catch in src/data/persistence.ts warned to a console nobody has open, and
 * the cache went on showing the change — so a rejected approval sat there
 * looking exactly like one that had landed, and survived a reload. QA filed it
 * as R4-M1; the PRD made it gate G7: "the UI can never show saved/approved for
 * data the database rejected".
 *
 * ## Why this is `fixme` and not running
 *
 * The first attempt induced the failure by aborting the Firestore write
 * channel. It does not work, and the reason is worth writing down because it
 * is a property of the SDK rather than a mistake in the test: an aborted
 * request is reported as UNAVAILABLE, which the Web SDK treats as retryable.
 * `batch.commit()` therefore never rejects — it stays pending and retries —
 * so the catch in persistence.ts is never reached. Measured, not assumed: the
 * banner assertion timed out after 15s while the page stayed healthy.
 *
 * So a network fault is the wrong fault to test with. The case that matters
 * is a DEFINITIVE refusal — `permission-denied` — which is now the ordinary
 * one: firestore.rules refuses an employee who approves their own expense
 * claim or moves their own leave out of Pending. Reaching that through the UI
 * needs an account whose `employee_links` record makes the claim its own, and
 * CLAUDE.md is explicit that a spec writing `employee_links` needs a persona
 * of its own — the document is shared by every project and worker in a run,
 * so linking a shared persona repoints who that account is underneath specs
 * that never mention links. GEOFENCE_PERSONA and HIRING_MANAGER_PERSONA exist
 * for exactly this.
 *
 * The remaining work is therefore: add a dedicated persona to
 * tests/e2e/config.ts, move this spec to the emulator-gated org-settings
 * project (where the other `employee_links` writers live), seed the link, and
 * drop the routing entirely. The rollback and the banner are implemented and
 * typecheck; this is the guard that is missing, and it is queued rather than
 * quietly dropped.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const CLAIMANT = 'E2E Rollback Claimant';
const CLAIM_ID = 'exp-e2e-rollback';

test.fixme('a refused change is undone and said out loud', async ({ page }) => {
  test.skip(persona().role !== 'admin', 'Persistence behaviour, not role behaviour — asked once.');

  await seedOrgRecords('employees', [
    {
      id: 'emp-e2e-rollback',
      employeeCode: 'EMP-E2E-ROLLBACK',
      firstName: 'E2E',
      lastName: 'Rollback Claimant',
      fullName: CLAIMANT,
      email: 'e2e-rollback@modcon-hr.test',
      phone: '+91 90000 00000',
      avatar: 'brand',
      dateOfBirth: '1990-01-01',
      designation: 'Engineer',
      department: 'Engineering',
      location: 'Bengaluru',
      employmentType: 'Full-time',
      status: 'Active',
      dateOfJoining: '2024-01-01',
      reportingManagerId: null,
      ctc: 1200000,
    },
  ]);
  await seedOrgRecords(
    'expenseClaims',
    [
      {
        id: CLAIM_ID,
        employeeId: 'emp-e2e-rollback',
        title: 'E2E rollback claim',
        category: 'Travel',
        amount: 850,
        date: '2026-09-01',
        status: 'Submitted',
        submittedOn: '2026-09-01',
        description: 'E2E write-failure rollback.',
      },
    ],
    { employeeId: (record) => record.employeeId },
  );

  await page.goto('/login');
  await page.locator('#username').fill(persona().email);
  await page.locator('#password').fill(persona().password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/expenses');
  await expect(page.getByRole('heading', { name: 'Expenses', exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const row = page.getByRole('row').filter({ hasText: CLAIMANT });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(1);

  // Only the write channel. Listens and document reads are left alone so the
  // page keeps working and the commit is the single thing that fails.
  await page.route(
    (url) => url.href.includes('/Write') || url.href.includes('/Commit'),
    (route) => route.abort(),
  );

  await row.getByRole('button', { name: 'Approve' }).click();

  // The banner is the half a silent rollback cannot supply. Without it the row
  // simply flips back a moment after the click, which reads as the app losing
  // the change rather than the server refusing it — and leaves somebody
  // clicking Approve over and over.
  await expect(page.getByTestId('save-failure-banner')).toBeVisible({ timeout: 15_000 });

  // And the claim is back to what the database actually holds.
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(1, { timeout: 15_000 });
  await expect(row).toContainText('Submitted');
});
