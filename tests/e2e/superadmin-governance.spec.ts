import { test, expect, type Page } from '@playwright/test';
import { SUPER_ADMIN } from './config';
import { EMULATOR_HOST, FIRESTORE_BASE, adminToken, signInPersona } from './firestore';

/**
 * Governance around a super admin entering a tenant's organisation.
 *
 * QA (C0): the "Manage this org" scope flag granted full HR-administrator
 * access to any organisation's data on one unconfirmed click, survived
 * sign-out, and was documented only in fine print. This spec is the
 * governance half of the fix: a confirmation before entering
 * (`ConfirmEnterOrgModal`), an `audit_logs` entry for it
 * (`src/lib/auditLog.ts`), a banner that stays visible while the scope is
 * active (`SuperAdminScopeBanner`), and the flag being cleared on sign-out
 * (`clearSuperAdminOrgSelection` in `src/lib/orgScope.ts`). The data-read
 * boundary itself — that a tenant cannot be read without entering it — was
 * already fixed server-side and belongs to `tests/rules/`, not here.
 *
 * Structured like `org-isolation.spec.ts`: the same super-admin sign-in, a
 * fresh browser context per test so the scope flag from one test cannot leak
 * into the next (it is per-browser state, same as there), and Firestore read
 * straight through the emulator's owner bypass rather than through anything
 * the app displays — an assertion about what got *written* must not be
 * satisfiable by what the UI merely shows.
 *
 * Emulator only, for the same reason `adminToken()` is emulator-only reach
 * here: against the live project that helper signs in as the ordinary tenant
 * admin persona, which `audit_logs`'s rules correctly refuse a read from —
 * only a super admin may read it. There is no live-reachable equivalent, and
 * this project writes no live data regardless (see CLAUDE.md, "Tests run
 * against emulators, never the live project").
 */
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(SUPER_ADMIN.email);
  await page.locator('#password').fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Which organisation this browser has stepped into, as the app stores it. */
function selectedOrg(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('modcon.hr.superAdminSelectedOrg'));
}

const ACTION = 'super_admin.enter_org';

/**
 * Every `audit_logs` entry for one action against one organisation, read
 * straight from Firestore.
 */
async function auditEntries(
  orgId: string,
  action: string,
): Promise<Array<{ actorUid?: string; actorEmail?: string; orgName?: string; at?: string }>> {
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'audit_logs' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'orgId' }, op: 'EQUAL', value: { stringValue: orgId } } },
              { fieldFilter: { field: { fieldPath: 'action' }, op: 'EQUAL', value: { stringValue: action } } },
            ],
          },
        },
      },
    }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    document?: { fields?: Record<string, { stringValue?: string; timestampValue?: string }> };
  }>;
  return rows
    .map((row) => row.document?.fields)
    .filter((f): f is Record<string, { stringValue?: string; timestampValue?: string }> => Boolean(f))
    .map((f) => ({
      actorUid: f.actorUid?.stringValue,
      actorEmail: f.actorEmail?.stringValue,
      orgName: f.orgName?.stringValue,
      at: f.at?.timestampValue,
    }));
}

test.describe('a super admin confirms before entering an organisation, and it is audited', () => {
  test.skip(
    !EMULATOR_HOST,
    'reads audit_logs through the emulator owner bypass, which has no live-project equivalent',
  );

  test('the dialog blocks the switch until confirmed, and confirming files an audit entry', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const { uid } = await signInPersona(SUPER_ADMIN.email, SUPER_ADMIN.password);
      expect(uid, 'could not resolve the super admin uid to scope the audit query').toBeTruthy();

      await login(page);
      const before = (await auditEntries('default', ACTION)).filter((e) => e.actorUid === uid);

      await page.getByRole('button', { name: 'Manage ModCon Builders (Default)' }).first().click();

      // The dialog, not the switch: it names the organisation, and the scope
      // flag has not moved yet — the whole point of a confirmation step.
      const dialog = page.getByRole('dialog', { name: 'Enter this organization?' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('ModCon Builders (Default)');
      expect(await selectedOrg(page)).not.toBe('default');

      await dialog.getByRole('button', { name: 'Enter organization' }).click();

      // Switching reloads, so the storage read is polled rather than taken once.
      await expect.poll(() => selectedOrg(page), { timeout: 20_000 }).toBe('default');

      // The persistent banner — not fine print — on the page the switch
      // landed on, and still up after navigating elsewhere: it belongs to the
      // layout, not to one page.
      await expect(page.getByText(/You are managing.*as a super admin/).first()).toBeVisible();
      await page.goto('/payroll');
      await expect(page.getByText(/You are managing.*as a super admin/).first()).toBeVisible();

      // The audit entry this whole flow exists to guarantee — read from
      // Firestore, never from anything the app displays.
      await expect
        .poll(
          async () => (await auditEntries('default', ACTION)).filter((e) => e.actorUid === uid).length,
          { timeout: 20_000 },
        )
        .toBeGreaterThan(before.length);

      const after = (await auditEntries('default', ACTION)).filter((e) => e.actorUid === uid);
      const latest = after[after.length - 1];
      expect(latest?.actorEmail).toBe(SUPER_ADMIN.email);
      expect(latest?.orgName).toBe('ModCon Builders (Default)');
      expect(latest?.at, 'the rules pin `at` to serverTimestamp(); a missing value means the write disagreed with them').toBeTruthy();

      // Leave the browser managing nothing again before the context closes.
      await page.getByRole('button', { name: 'Exit to the platform console' }).click();
    } finally {
      await context.close();
    }
  });

  test('cancelling the dialog enters nothing and writes no audit entry', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const { uid } = await signInPersona(SUPER_ADMIN.email, SUPER_ADMIN.password);
      await login(page);
      const before = (await auditEntries('default', ACTION)).filter((e) => e.actorUid === uid);

      await page.getByRole('button', { name: 'Manage ModCon Builders (Default)' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Enter this organization?' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();

      // Still on the platform console, not inside the organisation.
      expect(await selectedOrg(page)).not.toBe('default');
      await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();

      // A cancelled click leaves no trace — an audit log that records
      // attempts it never confirmed is not a record of what happened.
      const after = (await auditEntries('default', ACTION)).filter((e) => e.actorUid === uid);
      expect(after.length).toBe(before.length);
    } finally {
      await context.close();
    }
  });

  test('signing out clears which organisation a super admin was managing', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page);
      await page.getByRole('button', { name: 'Manage ModCon Builders (Default)' }).first().click();
      await page
        .getByRole('dialog', { name: 'Enter this organization?' })
        .getByRole('button', { name: 'Enter organization' })
        .click();
      await expect.poll(() => selectedOrg(page), { timeout: 20_000 }).toBe('default');

      // Sign out — `signOutUser`, not `leaveSuperAdminOrg`'s own reload.
      await page.locator('button[title="Sign out"]').click();
      await expect(page).toHaveURL(/\/login$/);

      // Cleared before anyone signs back in — the scope flag surviving
      // `signOut` is exactly the "sticky across logout" half of C0.
      expect(await selectedOrg(page)).toBeNull();

      await login(page);
      // Landed on the platform console, not back inside the organisation the
      // last session left open — the point of clearing the flag rather than
      // merely hiding its banner.
      await expect(page).toHaveURL(/\/organizations$/);
      for (const tenantPage of ['Attendance', 'Leave', 'Payroll']) {
        await expect(page.getByRole('link', { name: tenantPage, exact: true })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });
});
