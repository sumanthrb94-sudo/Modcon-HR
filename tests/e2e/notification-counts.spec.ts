import { test, expect, type Page } from '@playwright/test';
import { type Persona } from './config';

/**
 * The number on the bell is the number in the queue it opens.
 *
 * The bell counted every pending record the viewer could *see*; each queue
 * lists only what the viewer may *decide*. A manager sees HR's requests and
 * the day-changing regularizations of their reports, and decides neither — so
 * the product owner was told "3 requests to review", tapped it, and found 1.
 * Both now come from `pendingApprovalsSummary`, and this pins it for every
 * persona, whatever records the run happens to hold.
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
  await expect(page.getByRole('link', { name: 'People & Documents' })).toBeVisible({ timeout: 20_000 });
}

/** Navigate without reloading — a reload is a sign-out here. */
async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function bellCount(page: Page, title: string): Promise<number> {
  const bell = page.getByRole('button', { name: 'Notifications' }).first();
  await bell.click();
  await expect(page.getByText('Notification preferences')).toBeVisible();
  const entry = page.getByText(title, { exact: true });
  // An entry with nothing pending is not shown at all.
  const count = (await entry.count())
    ? Number(((await entry.first().locator('xpath=following-sibling::*[1]').innerText()).match(/\d+/) ?? ['0'])[0])
    : 0;
  await bell.click();
  return count;
}

const QUEUES = [
  { title: 'Attendance regularizations', path: '/dashboard/pending-approvals/regularizations', subtitle: /(\d+) pending regularization/ },
  { title: 'Leave requests pending', path: '/dashboard/pending-approvals/leave-requests', subtitle: /(\d+) pending requests you can decide/ },
  { title: 'Expense claims need review', path: '/dashboard/pending-approvals/expense-claims', subtitle: /(\d+) submitted claims/ },
];

test('the bell counts what each approval queue lists', async ({ page }) => {
  const p = persona();
  test.skip(p.role === 'employee', 'An employee has no approval queues, and the bell offers none.');
  await login(page, p);

  for (const queue of QUEUES) {
    await go(page, '/dashboard');
    const bell = await bellCount(page, queue.title);
    await go(page, queue.path);
    const heading = page.getByText(queue.subtitle).first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    const listed = Number((await heading.innerText()).match(queue.subtitle)![1]);
    expect(bell, `${queue.title}: the bell said ${bell}, the queue lists ${listed}`).toBe(listed);
  }
});
