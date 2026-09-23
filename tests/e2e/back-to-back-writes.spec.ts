import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PERSONAS } from './config';
import { listOrgRecords } from './firestore';

/**
 * Two saves to the same store in quick succession, and BOTH must reach the
 * server.
 *
 * `save()` is optimistic: it writes the cache, fires its change event and
 * returns, and the commit follows without being awaited. That is deliberate.
 * What is not deliberate is a second save arriving while the first is still
 * in flight and one of them never landing — the record sits on screen looking
 * saved, and is gone on the next reload.
 *
 * QA saw exactly that shape: a helpdesk ticket visible before a reload and
 * absent after it, but only when another ticket had been written moments
 * before. This is that scenario reduced to its cause, and it asserts against
 * Firestore rather than the page, because the page is the thing that lies.
 *
 * The same path carries expenses, leave and attendance, so whatever it says
 * is not only about tickets.
 */

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(PERSONAS.admin.email);
  await page.locator('#password').fill(PERSONAS.admin.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Employees' })).toBeVisible({ timeout: 20_000 });
}

async function raiseTicket(page: Page, subject: string) {
  await page.getByRole('button', { name: 'Raise Ticket' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Raise a Ticket/ });
  await dialog.getByRole('combobox').first().selectOption({ index: 1 });
  await dialog.getByPlaceholder('Briefly describe your issue…').fill(subject);
  await dialog.getByRole('button', { name: 'Submit Ticket' }).click();
  // Submitting opens the new ticket's detail dialog over the list.
  await page.keyboard.press('Escape');
}

test('two tickets raised back to back both reach the server', async ({ page }) => {
  const stamp = Date.now().toString(36);
  const first = `Back to back A ${stamp}`;
  const second = `Back to back B ${stamp}`;

  await login(page);
  await page.getByRole('link', { name: 'Helpdesk', exact: true }).first().click();

  // No wait between them. The point is the second save landing while the
  // first commit is still in flight.
  await raiseTicket(page, first);
  await raiseTicket(page, second);

  await expect(page.getByRole('table').getByText(first)).toBeVisible();
  await expect(page.getByRole('table').getByText(second)).toBeVisible();

  // Now the only question that matters: did both actually commit?
  await expect
    .poll(
      async () => {
        const tickets = await listOrgRecords<{ subject?: string }>('tickets');
        const subjects = tickets.map((t) => t.subject);
        return [subjects.includes(first), subjects.includes(second)].join(',');
      },
      { timeout: 20_000, message: 'both tickets should reach Firestore' },
    )
    .toBe('true,true');
});

test('two pages raising a ticket each do not write the same document', async ({ browser }) => {
  // The case that actually lost a write, and the reason it was mistaken for a
  // persistence bug for so long: nothing fails. Helpdesk minted ids from a
  // `useState(57)` counter held per page load, so EVERY fresh page produced
  // `tkt-new-57` for its first ticket. Two pages wrote one document; the
  // duplicate ids collapsed in `deriveOverlay`, the change set came out empty,
  // and `push()` returned without sending anything. No error, no warning, the
  // row on screen, gone on the next reload.
  //
  // One page could never show this — the counter only restarts on a fresh
  // load — which is why back-to-back saves in a single page (above) pass.
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const A = `Two pages A ${stamp}`;
  const B = `Two pages B ${stamp}`;

  const contexts: BrowserContext[] = [];
  try {
    for (const subject of [A, B]) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await login(page);
      await page.getByRole('link', { name: 'Helpdesk', exact: true }).first().click();
      await raiseTicket(page, subject);
    }

    await expect
      .poll(
        async () => {
          const tickets = await listOrgRecords<{ id?: string; subject?: string }>('tickets');
          const mine = tickets.filter((t) => t.subject === A || t.subject === B);
          // Distinct ids as well as both present: two records sharing one id
          // is the defect, and "both subjects are somewhere" would not catch
          // it if one had overwritten the other.
          const ids = new Set(mine.map((t) => t.id));
          return `${mine.length}/${ids.size}`;
        },
        { timeout: 25_000, message: 'both tickets, under distinct ids' },
      )
      .toBe('2/2');
  } finally {
    for (const context of contexts) await context.close();
  }
});
