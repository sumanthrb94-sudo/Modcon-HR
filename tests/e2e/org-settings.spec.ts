import { test, expect, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { FIRESTORE_BASE, adminToken } from './firestore';
import { isBrowserTransportNoise } from './noise';

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
 * *deployed* ruleset, not the one in this working tree. A rules change
 * therefore cannot be verified here before it ships. The cross-machine test is
 * gated behind E2E_ORG_SETTINGS_DEPLOYED for that reason — it is the real
 * acceptance test for G3, and it could not pass until the rules were deployed.
 * They now are, so it should be run with the flag set; the same gate protects
 * anyone running the suite against a project whose rules are older.
 *
 * The other test runs unconditionally and asserts the property that made that
 * ordering safe: a refused Firestore write is logged and swallowed, never
 * thrown, so an organisation cannot lose an edit during the window between the
 * two deploys.
 *
 * Both write to a **shared** document now, which is why `removeTestPolicies`
 * exists — see its comment.
 */

const POLICY_NAME = 'E2E Isolation Leave';
const POLICIES_DOC = 'org_settings/default__leavePolicies';

/**
 * The leave types as **Firestore** holds them, not as the browser renders them.
 *
 * Null when the organisation's copy cannot be read at all (sign-in refused, or
 * nothing published yet) — which callers must not confuse with "the type is
 * gone", hence null rather than an empty array.
 */
async function publishedPolicyTypes(): Promise<string[] | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/${POLICIES_DOC}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const raw = (await res.json()).fields?.valueJson?.stringValue;
  if (typeof raw !== 'string') return null;
  return (JSON.parse(raw) as Array<{ type?: string }>).map((p) => String(p.type ?? ''));
}

/**
 * Remove the policies this suite created, out of band.
 *
 * Necessary now, and it was not before: configuration used to live in the
 * browser, so a test that added a leave policy dirtied only its own throwaway
 * context. It is a shared Firestore document today, which means a test that
 * does not clean up leaves a fake policy in the organisation's real
 * configuration — and every run adds another.
 *
 * Done over the Firestore REST API against whichever project the run targets —
 * live, or the emulator (see ./firestore). It reads and rewrites rather than
 * restoring a snapshot, so a policy a human added while the suite was running
 * is not thrown away.
 *
 * Runs **before** the suite as well as after. The afterAll alone is not enough:
 * a run interrupted with Ctrl-C never reaches it, and a sign-in that fails here
 * returns silently by design (a dirty organisation must not fail the suite), so
 * leftovers accumulate one per run until someone notices them in Settings. The
 * beforeAll makes the next run clean them up instead.
 */
async function removeTestPolicies() {
  const token = await adminToken();
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${FIRESTORE_BASE}/${POLICIES_DOC}`, { headers });
  // Nothing published yet — nothing to clean.
  if (res.status !== 200) return;

  const raw = (await res.json()).fields?.valueJson?.stringValue;
  if (typeof raw !== 'string') return;

  const policies = JSON.parse(raw) as Array<{ type?: string }>;
  const kept = policies.filter((p) => !String(p.type ?? '').startsWith(POLICY_NAME));
  if (kept.length === policies.length) return;

  await fetch(`${FIRESTORE_BASE}/${POLICIES_DOC}?updateMask.fieldPaths=valueJson`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { valueJson: { stringValue: JSON.stringify(kept) } } }),
  });
}

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
  // Before the suite, to sweep up whatever a previous interrupted run left
  // behind, and after it — not after each: the tests are serial and the second
  // reads what it wrote across two contexts. The afterAll runs even if a test
  // failed, so a red run does not leave the organisation's configuration dirty.
  test.beforeAll(removeTestPolicies);
  test.afterAll(removeTestPolicies);

  test('an edit stands on its own, whether or not the Firestore write lands', async ({ browser }) => {
    // Rules and the app deploy independently, so there is always a window where
    // the app is live against rules that have never heard of a collection. The
    // Firestore write is fire-and-forget behind the local one precisely so a
    // refused write cannot surface as a lost edit — this asserts the local path
    // stands alone and nothing throws, which held before org_settings was
    // deployed and must keep holding for the next collection that is added.
    const context = await browser.newContext();
    const page = await context.newPage();
    const denials: string[] = [];
    page.on('console', (m) => {
      if (m.text().includes('[org-settings]')) denials.push(m.text());
    });
    // App errors only. WebKit surfaces Firestore's own aborted long-poll
    // requests as uncaught errors, which is transport churn rather than
    // anything the settings code did — see isBrowserTransportNoise.
    const appErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!isBrowserTransportNoise(err.message)) appErrors.push(err.message);
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
    // Asserted here rather than thrown from the listener: a throw inside an
    // event handler surfaces as whatever the test happened to be awaiting,
    // which is how this last failed on the click two lines into the test
    // rather than on the error it actually objected to.
    expect(appErrors, 'unhandled application errors on the settings page').toEqual([]);

    await page.screenshot({ path: 'test-results/org-settings-survives-undeployed-rules.png', fullPage: true });
    await context.close();
  });

  test('a leave type can be deleted, and one with leave taken under it cannot', async ({ browser }) => {
    // Settings offered Edit but no Delete, so a leave type added by mistake —
    // or by this suite, which writes to the organisation's real configuration —
    // stayed for good and was offered in Apply Leave to everyone. That is what
    // `removeTestPolicies` existed to paper over out of band.
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, PERSONAS.admin);
    await openSettingsSection(page, 'Leave Policies');

    const unique = `${POLICY_NAME} ${Date.now()}`;
    await addLeavePolicy(page, unique);
    await expect(page.getByText(unique)).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: unique });
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(unique)).toHaveCount(0);

    // Gone for good rather than just out of this render — but only if the
    // publish lands. Sign-in re-hydrates localStorage from the organisation's
    // Firestore copy, so a refused write means the type is back after a reload,
    // which is exactly what a quota-exhausted or undeployed project does. Gated
    // with the other round-trip assertion in this file, for the same reason.
    if (process.env.E2E_ORG_SETTINGS_DEPLOYED === 'true') {
      // The Firestore write trails the local one and is fire-and-forget
      // (publishOrgSetting does not await setDoc), so a reload issued
      // immediately after the click tears down the page with the delete still
      // queued — Firestore keeps the pre-delete array, sign-in re-hydrates it,
      // and the type is back. Wait for the write to actually land rather than
      // sleeping a guessed interval: a fixed wait is either flaky on a slow
      // network or slower than it needs to be on a fast one. A read that fails
      // outright keeps polling — absent evidence is not evidence of deletion.
      // 'unreadable' rather than a bare true, so a quota-exhausted or
      // otherwise unreachable project says so instead of being reported as a
      // delete that never landed — which is how a 429 first presented.
      await expect
        .poll(
          async () => {
            const published = await publishedPolicyTypes();
            if (!published) return 'unreadable';
            return published.includes(unique) ? 'still there' : 'gone';
          },
          {
            message: 'the delete never reached the organisation\'s Firestore copy',
            timeout: 15_000,
          },
        )
        .toBe('gone');
      await page.reload();
      await openSettingsSection(page, 'Leave Policies');
      await expect(page.getByText(unique)).toHaveCount(0);
    }

    // Casual Leave has requests recorded against it. Deleting it would leave
    // approved leave with no policy to be measured against, so it is refused.
    const casual = page.getByRole('row').filter({ hasText: 'Casual Leave' });
    await casual.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/leave requests? recorded against it/)).toBeVisible();
    // Exact: the refusal message names the type too.
    await expect(page.getByText('Casual Leave', { exact: true })).toBeVisible();

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

  test('a refused publish is shown to the person who made the edit, not just swallowed', async ({ browser }) => {
    // The sibling test above asserts a refused write does not *break* the edit.
    // This asserts the other half, which was missing: that it does not pass for
    // a successful one either. A publish the rules refuse leaves the change in
    // one browser, and that is exactly the state in which a reload loses it —
    // so the section says so rather than showing the same "Saved" an
    // organisation-wide write gets.
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, PERSONAS.employee);

    // The same forged local grant the Database-section test uses: the
    // permission matrix is client-owned, so an employee can reach Settings.
    // What they cannot do is write org_settings — firestore.rules decides that.
    await page.evaluate(() => {
      window.localStorage.setItem(
        'modcon.hr.accessControl.permissions',
        JSON.stringify({ Settings: { Employee: 'full' } }),
      );
    });
    await openSettingsSection(page, 'Leave Policies');

    // Named like the suite's other policies so the cleanup catches it if the
    // rules ever start allowing this write — the point of the test is that
    // they do not, and a silent regression must not dirty the organisation.
    const unique = `${POLICY_NAME} ${Date.now()}`;
    await addLeavePolicy(page, unique);

    await expect(page.getByText('Not saved to your organisation')).toBeVisible({ timeout: 20_000 });

    // And the organisation's copy really is untouched — the warning is not
    // merely cosmetic. Checked at the source rather than through the UI:
    // Firestore rolls the rejected write back, the rollback arrives as a
    // snapshot, and startOrgSettingsSync hydrates localStorage from the
    // unchanged remote copy, so the row disappears from the table too. That
    // revert is the SDK's behaviour rather than this app's, so it is the
    // document that is asserted here, not the disappearance.
    expect(await publishedPolicyTypes()).not.toContain(unique);
    await page.screenshot({ path: 'test-results/org-settings-refused-publish.png', fullPage: true });
    await context.close();
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
