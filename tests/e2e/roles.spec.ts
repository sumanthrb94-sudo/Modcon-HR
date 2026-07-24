import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { type Persona } from './config';

/**
 * Per-role end-to-end flow.
 *
 * This spec runs once per role project (role-employee / role-manager /
 * role-admin), which execute in parallel. Each persona signs in and the test
 * asserts role-appropriate navigation and access control.
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

test.describe.serial('role-based access', () => {
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

  test('shows the correct role in the topbar', async () => {
    await expect(page.getByText(persona().roleLabel, { exact: true }).first()).toBeVisible();
  });

  test('base modules are always reachable', async () => {
    for (const label of ['Employees', 'Attendance', 'Leave', 'Reports']) {
      await page.getByRole('link', { name: label, exact: true }).first().click();
      await expect(page.getByRole('heading').first()).toBeVisible();
    }
  });

  test('Approvals nav visibility matches role', async () => {
    const p = persona();
    const approvals = page.getByRole('link', { name: 'Approvals', exact: true });
    if (p.role === 'employee') {
      await expect(approvals).toHaveCount(0);
    } else {
      await expect(approvals.first()).toBeVisible();
    }
  });

  test('Admin nav visibility matches role', async () => {
    const p = persona();
    const admin = page.getByRole('link', { name: 'Admin', exact: true });
    if (p.role === 'admin') {
      await expect(admin.first()).toBeVisible();
    } else {
      await expect(admin).toHaveCount(0);
    }
  });

  test('approvals route access control', async () => {
    const p = persona();
    await page.goto('/approvals');
    if (p.role === 'employee') {
      // Employees are redirected back to the dashboard.
      await expect(page).toHaveURL(/\/$|\/dashboard/);
      await expect(page.getByRole('link', { name: 'Approvals', exact: true })).toHaveCount(0);
    } else {
      await expect(page).toHaveURL(/\/approvals$/);
      await expect(page.getByRole('heading').first()).toBeVisible();
    }
  });

  test('admin route access control', async () => {
    const p = persona();
    await page.goto('/admin');
    if (p.role === 'admin') {
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole('heading').first()).toBeVisible();
    } else {
      await expect(page).not.toHaveURL(/\/admin$/);
    }
  });
});
