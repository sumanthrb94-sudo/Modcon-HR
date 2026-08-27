import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS, ROLE_CHURN_PERSONA } from './config';
import { EMULATOR_HOST, setStoredRole, signInPersona } from './firestore';

/**
 * A role change reaches a session that is already open.
 *
 * The role was read once, by the sign-in upsert in src/lib/auth.tsx, and then
 * held in React state for the life of the session. So every way of changing
 * somebody's role — the Admin dashboard, "Set HR admin" and "Review admin
 * roles" in Organizations, and moving somebody in or out of an HR designation
 * — wrote `users/{uid}` and changed nothing about the app in front of them
 * until they happened to sign out and back in.
 *
 * The revocation direction is the one that matters. `applyRoleToExistingAccount`
 * (src/data/roleAssignments.ts) exists precisely so that moving somebody out of
 * the HR department withdraws their administrator access without waiting for a
 * re-login — its comment says they "would keep administrator access
 * indefinitely" otherwise — and it was writing a document no client read. So
 * this spec asserts the grant *and* the withdrawal; a fix that only repainted
 * on promotion would pass the first and fail the second.
 *
 * **Two live sessions, and nothing here reloads.** An administrator drives the
 * real Admin dashboard control in one browser context while the subject sits in
 * another, and every assertion is made against the page that was already open
 * when the role changed underneath it. A reload would re-run the sign-in upsert
 * and pass against the old code, proving nothing.
 *
 * The change is deliberately made through the dashboard rather than by writing
 * `users/{uid}` over the REST API: an emulator write made with the `Bearer
 * owner` bypass does not reach the Watch streams the app is listening on, so a
 * spec built that way fails whatever the client does. It is also the flow an
 * administrator actually uses.
 *
 * Runs in the org-settings project because it needs the emulator to own the
 * accounts it rewrites. It writes no shared organisation configuration — it
 * changes exactly one account, a dedicated one (ROLE_CHURN_PERSONA), because
 * the projects run in parallel and demoting a persona another spec is signed in
 * as would fail that spec somewhere far from the cause.
 */

// Manager-only navigation, from `navItems` in src/lib/nav.ts, filtered by
// `Sidebar` on the role the auth provider publishes. The cheapest thing on
// screen that is downstream of the role and of nothing else.
const MANAGER_NAV = 'Approvals';

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#username').fill(who.email);
  await page.locator('#password').fill(who.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/** The Admin dashboard's role control for one account, found by its address. */
function roleSelectFor(adminPage: Page, email: string) {
  return adminPage.locator('tr').filter({ hasText: email }).locator('select');
}

test.describe.serial('a role change reaches an open session', () => {
  let subjectContext: BrowserContext;
  let adminContext: BrowserContext;
  let subject: Page;
  let admin: Page;
  let uid: string;

  test.beforeAll(async ({ browser }) => {
    test.skip(!EMULATOR_HOST, 'rewrites a test account\'s role — emulator accounts only');

    const signedIn = await signInPersona(ROLE_CHURN_PERSONA.email, ROLE_CHURN_PERSONA.password);
    if (!signedIn.uid) throw new Error(`[e2e] no uid for ${ROLE_CHURN_PERSONA.email}`);
    uid = signedIn.uid;
    // Whatever an interrupted previous run left behind, before anybody signs
    // in and caches it. The account is this spec's alone, so resetting it
    // cannot disturb another project.
    await setStoredRole(uid, 'employee');

    subjectContext = await browser.newContext();
    subject = await subjectContext.newPage();
    await signIn(subject, ROLE_CHURN_PERSONA);

    adminContext = await browser.newContext();
    admin = await adminContext.newPage();
    await signIn(admin, PERSONAS.admin);
    await admin.goto('/admin');
    await expect(roleSelectFor(admin, ROLE_CHURN_PERSONA.email)).toBeVisible({ timeout: 20_000 });
  });

  test.afterAll(async () => {
    // Restored even if an assertion above failed: a churn account left as a
    // manager makes the next run's opening assertion fail for a reason that
    // has nothing to do with the code.
    if (uid) await setStoredRole(uid, 'employee').catch(() => undefined);
    await subjectContext?.close();
    await adminContext?.close();
  });

  test('signs in with the role its stored profile carries', async () => {
    await expect(subject.getByText('Employee', { exact: true }).first()).toBeVisible();
    await expect(subject.getByRole('link', { name: MANAGER_NAV, exact: true })).toHaveCount(0);
  });

  test('a promotion arrives without signing out', async () => {
    await roleSelectFor(admin, ROLE_CHURN_PERSONA.email).selectOption('manager');

    // The sidebar and the topbar label are two independent readers of the same
    // profile — one through the `navItems` filter, one through
    // `resolveAppRole`. Asserting both is what separates "the provider
    // republished" from "one component happened to re-render".
    await expect(subject.getByRole('link', { name: MANAGER_NAV, exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(subject.getByText('Manager', { exact: true }).first()).toBeVisible();
  });

  test('a manager-only route opens on the new role, still without reloading', async () => {
    await subject.goto('/approvals');
    // RequireManager sends anybody else to '/', so arriving here at all is the
    // guard reading the new role.
    await expect(subject).toHaveURL(/\/approvals$/);
    await expect(subject.getByRole('heading').first()).toBeVisible();
  });

  test('a demotion is withdrawn just as promptly, and ejects the open page', async () => {
    await roleSelectFor(admin, ROLE_CHURN_PERSONA.email).selectOption('employee');

    await expect(subject.getByRole('link', { name: MANAGER_NAV, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(subject.getByText('Employee', { exact: true }).first()).toBeVisible();

    // Still sitting on /approvals when the role went away: RequireManager
    // re-evaluates on the next render, so the page this account no longer has
    // is left rather than staying open until the next navigation.
    await expect(subject).not.toHaveURL(/\/approvals$/);
  });
});
