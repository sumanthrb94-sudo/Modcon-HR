import { test, expect, type Page } from '@playwright/test';
import { HR_PERSONA } from './config';

/**
 * HR opens the standard checklist for a new hire.
 *
 * There was no way to create an onboarding record at all, so the page could
 * only ever show what the seed contained — an organisation that had hired
 * somebody had nowhere to say so, and every stat card on it read 0.
 *
 * Runs in the org-settings project: starting an onboarding writes the
 * organisation's shared record, and the app project runs on three engines,
 * which would be three concurrent writers.
 */
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Select the option whose text contains `text`.
 *
 * Playwright's `selectOption({ label })` takes an exact string, and these
 * options carry the designation after the name.
 */
async function selectByText(select: ReturnType<Page['getByLabel']>, text: string) {
  const value = await select.locator('option').filter({ hasText: text }).first().getAttribute('value');
  expect(value, `no option containing "${text}"`).toBeTruthy();
  await select.selectOption(value as string);
}

test.describe.serial('HR starts an onboarding', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page, HR_PERSONA.email, HR_PERSONA.password);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('a new hire can be put on the standard checklist', async () => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Start Onboarding' }).click();
    const dialog = page.getByRole('dialog');
    await selectByText(dialog.getByLabel('Onboarding employee'), 'Riya Sharma');
    await dialog.getByLabel('Onboarding start date').fill('2026-08-10');
    await dialog.getByLabel('Onboarding buddy').fill('Sneha Patil');
    await dialog.getByRole('button', { name: 'Start Onboarding' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText('Riya Sharma').first()).toBeVisible();
  });

  test('and counts as one in progress before any task is ticked', async () => {
    // The card required progress > 0, so a hire on day one — the clearest case
    // of an onboarding in progress — was counted as none at all.
    const card = page.getByText('Onboarding In Progress').locator('..');
    await expect(card).not.toContainText(/\b0\b/);
  });
});
