import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS } from './config';

/**
 * Two browsers, one organisation, the same data.
 *
 * This is the spec the whole move to Firestore exists for, and it is the one
 * thing the rest of the suite structurally could not catch: every other spec
 * runs in a single context, where per-browser storage and shared storage are
 * indistinguishable. Attendance, leave, assets, helpdesk, onboarding and
 * payroll all lived in `localStorage` and nowhere else, so an employee checking
 * in on their phone and HR on a laptop were looking at two unrelated datasets —
 * and nothing here would have gone red.
 *
 * So: **a second browser context**, which is a different browser as far as
 * storage is concerned. A record created in the first must appear in the
 * second. A reload would prove nothing; the cache reloads with the page.
 *
 * Runs in the org-settings project because it writes records every member of
 * the organisation can see, and cleans them up afterwards.
 */

const PERSONA = PERSONAS.admin;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONA.email);
  await page.locator('#password').fill(PERSONA.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('records are the organisation’s, not the browser’s', () => {
  let first: BrowserContext;
  let second: BrowserContext;
  let pageOne: Page;
  let pageTwo: Page;
  const stamp = Date.now().toString().slice(-6);
  const assetName = `Shared Asset ${stamp}`;

  test.beforeAll(async ({ browser }) => {
    first = await browser.newContext();
    second = await browser.newContext();
    pageOne = await first.newPage();
    pageTwo = await second.newPage();
    await login(pageOne);
    await login(pageTwo);
  });

  test.afterAll(async () => {
    await first?.close();
    await second?.close();
  });

  test('an asset added in one browser reaches the other', async () => {
    await pageOne.goto('/assets');
    await pageOne.getByRole('button', { name: 'Add Asset' }).first().click();
    const dialog = pageOne.getByRole('dialog');
    await dialog.getByPlaceholder('e.g. MacBook Pro 14').fill(assetName);
    await dialog.getByPlaceholder('e.g. SN-2026-0001').fill(`SN-${stamp}`);
    await dialog.getByPlaceholder('e.g. 85000').fill('54321');
    const category = dialog.locator('select').first();
    await category.selectOption(
      (await category.locator('option').nth(1).getAttribute('value')) as string,
    );
    await pageOne.getByRole('dialog').getByRole('button', { name: 'Add Asset' }).click();
    await pageOne.keyboard.press('Escape');
    await expect(pageOne.getByRole('table').getByText(assetName)).toBeVisible();

    await pageTwo.goto('/assets');
    await expect(pageTwo.getByRole('table').getByText(assetName)).toBeVisible({ timeout: 25_000 });
  });

  test('and it survives a reload in the browser that never created it', async () => {
    // Guards the direction the cache alone would satisfy: the second browser
    // holding the record because it read the server once, not because a
    // subscription happened to be open.
    await pageTwo.reload();
    await expect(pageTwo.getByRole('table').getByText(assetName)).toBeVisible({ timeout: 25_000 });
  });
});

test.describe.serial('the board', () => {
  let first: BrowserContext;
  let second: BrowserContext;
  let author: Page;
  let reader: Page;
  const body = `Shared board post ${Date.now().toString().slice(-6)}`;

  test.beforeAll(async ({ browser }) => {
    first = await browser.newContext();
    second = await browser.newContext();
    author = await first.newPage();
    reader = await second.newPage();
    await login(author);
    await login(reader);
  });

  test.afterAll(async () => {
    // Remove the post so a run does not leave a message on the organisation's
    // real board — the same reasoning that makes the other org-settings specs
    // restore what they change.
    if (author && !author.isClosed()) {
      try {
        await author.goto('/board');
        const card = author.locator('.card', { hasText: body }).first();
        if (await card.count()) {
          await card.getByRole('button', { name: 'Delete' }).click();
          await expect(author.locator('.card', { hasText: body })).toHaveCount(0, { timeout: 15_000 });
        }
      } catch {
        // Best effort — a failure here must not mask the one that caused it.
      }
    }
    await first?.close();
    await second?.close();
  });

  test('a post appears on everybody’s board', async () => {
    await author.goto('/board');
    await author.getByLabel('Write a post').fill(body);
    await author.getByRole('button', { name: 'Post', exact: true }).click();
    // Scoped to the post card: the composer holds the same text until it
    // clears, so an unscoped match is ambiguous rather than wrong.
    await expect(author.locator('.card', { hasText: body }).first()).toBeVisible({
      timeout: 20_000,
    });

    // A browser that shares no storage with the author's.
    await reader.goto('/board');
    await expect(reader.locator('.card', { hasText: body }).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test('a reaction from one person shows for the other', async () => {
    const card = reader.locator('.card', { hasText: body }).first();
    await card.getByRole('button', { name: 'React 🎉' }).click();

    const authorCard = author.locator('.card', { hasText: body }).first();
    await expect(authorCard.getByText('🎉 1')).toBeVisible({ timeout: 20_000 });
  });

  test('a reply from one person shows for the other', async () => {
    const card = reader.locator('.card', { hasText: body }).first();
    await card.getByRole('button', { name: 'Reply', exact: true }).click();
    await card.getByLabel('Write a reply').fill('Seen, thanks.');
    await card.getByRole('button', { name: 'Send reply' }).click();

    const authorCard = author.locator('.card', { hasText: body }).first();
    await expect(authorCard.getByRole('button', { name: '1 reply' })).toBeVisible({
      timeout: 20_000,
    });
  });
});
