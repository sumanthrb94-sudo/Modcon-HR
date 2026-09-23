import { test, expect, type Browser, type Page } from '@playwright/test';
import { HR_PERSONA, PERSONAS, SUPER_ADMIN } from './config';

/**
 * Support chat, both directions, in two separate browser contexts.
 *
 * The Super Admin cannot see an organisation's HR data, so this is how an HR
 * team reaches the platform. HR opens a conversation; the Super Admin finds
 * it in the Support inbox and replies; HR sees the reply. A Manager is kept
 * out — their questions go to their own HR through Helpdesk.
 *
 * In the org-settings project: it writes shared Firestore documents.
 */

async function signIn(browser: Browser, persona: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.locator('#username').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  return page;
}

test('HR opens a conversation, the Super Admin answers, HR sees the answer', async ({ browser }) => {
  const subject = `E2E support ${Date.now().toString(36)}`;

  const hr = await signIn(browser, HR_PERSONA);
  await hr.goto('/support');
  await hr.getByRole('button', { name: 'New conversation' }).click();
  const dialog = hr.getByRole('dialog', { name: /New conversation/ });
  await dialog.getByLabel('Subject').fill(subject);
  await dialog.getByLabel('Message').fill('Our HR admin cannot sign in.');
  await dialog.getByRole('button', { name: 'Send to platform' }).click();
  await expect(dialog).toBeHidden();
  await expect(hr.getByTestId('support-messages')).toContainText('Our HR admin cannot sign in.');

  const platform = await signIn(browser, SUPER_ADMIN);
  await platform.goto('/support');
  await expect(platform.getByRole('heading', { name: 'Support inbox' })).toBeVisible();
  await platform.getByTestId('support-threads').getByRole('button', { name: new RegExp(subject) }).click();
  await expect(platform.getByTestId('support-messages')).toContainText('Our HR admin cannot sign in.');
  await platform.getByLabel('Reply').fill('Reset link sent — check the inbox.');
  await platform.getByRole('button', { name: 'Send' }).click();

  // HR's page is live: the reply arrives without a reload.
  await expect(hr.getByTestId('support-messages')).toContainText('Reset link sent — check the inbox.', { timeout: 15_000 });
  await expect(hr.getByTestId('support-messages')).toContainText('ModCon HR platform team');

  await hr.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(platform.getByTestId('support-threads').getByRole('button', { name: new RegExp(subject) })).toContainText('Resolved', { timeout: 15_000 });
});

test('a Manager does not reach Support', async ({ browser }) => {
  const manager = await signIn(browser, PERSONAS.manager);
  await manager.goto('/support');
  await expect(manager).not.toHaveURL(/\/support$/);
  await expect(manager.getByRole('link', { name: 'Support', exact: true })).toHaveCount(0);
});
