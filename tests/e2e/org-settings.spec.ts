import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Organisation configuration, and the operations that write it.
 *
 * Leave policies — with the company profile, holiday calendar, departments and
 * permission matrix alongside them — used to live only in localStorage,
 * namespaced per org by a key suffix. Two consequences, and only the first is
 * about isolation: the tenant boundary was a value the client owns, and two
 * administrators of the same organisation did not share the configuration at
 * all. Accrual policy is what LOP deductions are computed from, so that was a
 * payroll input that depended on which laptop you opened. They now live in
 * `org_settings`, org-scoped in firestore.rules. See G3 in
 * docs/tenant-isolation-spec.md.
 *
 * ## What this suite can and cannot check
 *
 * The E2E suite signs in against **live** Firebase, so it runs against the
 * *deployed* ruleset, not the one in this working tree. `org_settings` does not
 * exist in the deployed rules until someone runs
 * `firebase deploy --only firestore:rules`, so until then every read and write
 * of it is refused by the catch-all deny. The cross-machine test below is
 * therefore gated behind E2E_ORG_SETTINGS_DEPLOYED — it is the real acceptance
 * test for G3 and cannot pass before the rules ship. The server behaviour it
 * would assert is covered meanwhile by tests/rules/multitenancy.rules.test.mjs.
 *
 * What runs unconditionally is the half that matters between those two deploys:
 * the app must keep working against rules that have never heard of this
 * collection. That is the documented rollout order (rules first, app second),
 * and a silent failure here would mean an organisation losing its configuration
 * during the window.
 */

const POLICY_NAME = 'E2E Isolation Leave';

async function signIn(page: Page, persona: typeof PERSONAS.admin) {
  await page.goto('/login');
  await page.locator('#username').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function openSettingsSection(page: Page, name: string) {
  await page.goto('/settings');
  await page.getByRole('button', { name }).click();
}

async function addLeavePolicy(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add Leave Type' }).click();
  // By role rather than getByLabel: the dialog is itself labelled "Add Leave
  // Type", and getByLabel matches on substring.
  const dialog = page.getByRole('dialog', { name: 'Add Leave Type' });
  await dialog.getByRole('textbox', { name: 'Leave Type', exact: true }).fill(name);
  // Annual Quota is disabled while Accrual is 'monthly' (the default), because
  // a monthly policy derives its yearly figure.
  await dialog.getByLabel('Accrual').selectOption('annual');
  await dialog.getByRole('spinbutton', { name: 'Annual Quota', exact: true }).fill('7');
  await page.getByRole('button', { name: 'Save Leave Type' }).click();
}

test.describe.serial('organisation configuration', () => {
  test('editing configuration still works while the org_settings rules are undeployed', async ({ browser }) => {
    // Rules and app deploy independently, so this window is real. The Firestore
    // write is fire-and-forget behind the local one precisely so a refused
    // write cannot surface as a lost edit.
    const context = await browser.newContext();
    const page = await context.newPage();
    const denials: string[] = [];
    page.on('console', (m) => {
      if (m.text().includes('[org-settings]')) denials.push(m.text());
    });
    page.on('pageerror', (err) => {
      throw new Error(`unhandled error on the settings page: ${err.message}`);
    });

    await signIn(page, PERSONAS.admin);
    await openSettingsSection(page, 'Leave Policies');
    await expect(page.getByRole('button', { name: 'Add Leave Type' })).toBeVisible();

    const unique = `${POLICY_NAME} ${Date.now()}`;
    await addLeavePolicy(page, unique);
    await expect(page.getByText(unique)).toBeVisible();

    // Survives a reload: the local write is unaffected by the remote refusal.
    await page.reload();
    await openSettingsSection(page, 'Leave Policies');
    await expect(page.getByText(unique)).toBeVisible();

    // A refused publish must be reported and swallowed, never thrown — an
    // unhandled rejection here would surface as a broken Save.
    if (denials.length) {
      expect(denials.join('\n')).toContain('could not');
    }

    await page.screenshot({ path: 'test-results/org-settings-survives-undeployed-rules.png', fullPage: true });
    await context.close();
  });

  test('a leave policy saved on one machine is there on a machine that has never seen it', async ({ browser }) => {
    test.skip(
      process.env.E2E_ORG_SETTINGS_DEPLOYED !== 'true',
      'Needs `firebase deploy --only firestore:rules`: this asserts the Firestore round-trip, ' +
        'and the deployed ruleset has no org_settings collection until then.',
    );

    // --- machine 1: the administrator who configures the policy ------------
    const first = await browser.newContext();
    const page = await first.newPage();
    await signIn(page, PERSONAS.admin);
    await openSettingsSection(page, 'Leave Policies');

    const unique = `${POLICY_NAME} ${Date.now()}`;
    await addLeavePolicy(page, unique);
    await expect(page.getByText(unique)).toBeVisible();
    // The Firestore write trails the local one; wait for it rather than racing.
    await page.waitForTimeout(2_000);
    await first.close();

    // --- machine 2: a fresh browser, no localStorage at all ----------------
    // The step that fails against the localStorage-only version: the policy
    // never left the first browser. This is deliberately not a reload —
    // persistence.spec.ts reloads, and a reload passes either way.
    const second = await browser.newContext();
    const fresh = await second.newPage();
    await signIn(fresh, PERSONAS.admin);
    await openSettingsSection(fresh, 'Leave Policies');

    await expect(fresh.getByText(unique)).toBeVisible({ timeout: 20_000 });
    await fresh.screenshot({ path: 'test-results/org-settings-second-machine.png', fullPage: true });
    await second.close();
  });
});

/**
 * The Database section authorizes on the server-backed role (G5).
 *
 * /settings is guarded by `RequireModuleAccess`, which reads the permission
 * matrix out of localStorage — a value the client owns, and one
 * `enforceRequiredPermissions` does not pin for the Settings row. So reaching
 * the section proves nothing, and the section's own operations include a
 * localStorage sweep with no server to refuse it. This test performs exactly
 * the devtools edit that used to work.
 */
test.describe('the Database section is not reachable by granting yourself the module', () => {
  test('an employee who grants themselves Settings still cannot run the data operations', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, PERSONAS.employee);

    // The forged local grant: Settings to the Employee role.
    await page.evaluate(() => {
      window.localStorage.setItem(
        'modcon.hr.accessControl.permissions',
        JSON.stringify({ Settings: { Employee: 'full' } }),
      );
    });
    await page.goto('/settings');

    // The forgery works on the *navigation* — that is the point, the matrix is
    // client-owned and this is not where the decision belongs.
    await page.getByRole('button', { name: 'Database' }).click();

    // …and the section refuses anyway, on `profile.role` from Firestore.
    await expect(page.getByText(/restricted to administrators/i)).toBeVisible();
    // The three operations the section offers. Not a looser /seed/i match —
    // the Database *tab* is described "Firestore seed & config", so that would
    // match the navigation it is legitimately still allowed to see.
    await expect(page.getByRole('button', { name: 'Delete Mock Data' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Seed Firestore' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Backfill/i })).toHaveCount(0);

    await page.screenshot({ path: 'test-results/database-section-refuses-forged-grant.png', fullPage: true });
    await context.close();
  });
});
