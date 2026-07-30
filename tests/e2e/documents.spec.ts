import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { type Persona } from './config';

/**
 * Employee handbook — per-role UI surface.
 *
 * This runs once per role project (role-employee / role-manager / role-admin)
 * and asserts the half of the module the UI is actually responsible for:
 * everybody can reach the handbook, and nobody who isn't HR is offered the
 * upload panel.
 *
 * What this spec deliberately does NOT cover, and where that coverage lives:
 *
 *   A successful HR publish. There is no `hr` persona, and adding one would not
 *   help: firestore.rules mirrors ADMIN_EMAILS but pointedly does not trust the
 *   E2E allow-list ("E2E test emails are a client-side-only gate and are never
 *   trusted here"), so an E2E account's own sign-in write cannot set
 *   `users/{uid}.role = 'hr'` without a real `role_assignments` document
 *   authored by an administrator. An E2E HR persona would therefore see the
 *   upload panel and then be denied by the server — which is the security model
 *   working, not a bug, but it makes the happy path untestable here.
 *
 *   So the write side is proved in tests/rules/handbook.rules.test.mjs, against
 *   the emulator, where roles can be seeded directly. That file is the
 *   authority on who may publish; this one only checks what gets drawn.
 *
 * Note the absence assertions below are `toHaveCount(0)`, not `not.toBeVisible`
 * — the panel is not rendered at all for non-HR, and a selector that matches
 * nothing satisfies `not.toBeVisible` even if the guard were removed and the
 * markup renamed.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

async function login(page: Page, p: Persona) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('employee handbook', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await login(page, persona());
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('Documents is in the sidebar for every role', async () => {
    // The nav entry carries no adminOnly/managerOnly flag, so this failing for
    // any persona means the permission matrix withdrew a read it must not.
    await expect(page.getByRole('link', { name: 'Documents', exact: true })).toBeVisible();
  });

  test('the handbook page is reachable and renders', async () => {
    await page.getByRole('link', { name: 'Documents', exact: true }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    // Either a published handbook or the empty state — never the access-denied
    // card, which is what a regression in the matrix floor would produce.
    await expect(page.getByText('Access Restricted')).toHaveCount(0);
  });

  test('survives a reload', async () => {
    // The handbook is Firestore-backed rather than component state, so a reload
    // must land back on a rendered page and not an empty shell.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
    await expect(page.getByText('Access Restricted')).toHaveCount(0);
  });

  test('no upload control is offered to a non-HR role', async () => {
    // Every persona in this suite is employee, manager or admin. Admin is
    // included on purpose: publishing is HR-only by specification, so an admin
    // seeing this panel is a defect even though admin outranks HR elsewhere.
    await expect(page.getByTestId('handbook-publish')).toHaveCount(0);
    await expect(page.getByText('Publish a new version')).toHaveCount(0);
    await expect(page.locator('#handbook-file')).toHaveCount(0);
  });
});
