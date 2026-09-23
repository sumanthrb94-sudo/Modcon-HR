import { test, expect, type Page } from '@playwright/test';
import { SUPER_ADMIN, type Persona } from './config';

/**
 * The app is usable at real phone widths — 375, 390 and 414 px (G12).
 *
 * Every earlier "mobile" check used a 636–795 px side panel as a proxy, which
 * is a tablet. At a phone's width the failure is a page wider than the screen:
 * content cut off at the right edge, reachable only by scrolling the whole page
 * sideways. Tables are allowed to scroll inside their own container — that is
 * how a wide table is meant to behave on a phone — but the page itself must not.
 *
 * Also checks the one piece of chrome that only exists on a phone: the menu
 * button has to open the navigation, and it has to be closable again.
 *
 * Runs once per role project, since each role sees different pages.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const WIDTHS = [375, 390, 414];
const ROUTES = ['/', '/leave', '/attendance', '/expenses', '/helpdesk', '/employees', '/assets', '/settings', '/board'];
// Pages only some roles reach. The Admin dashboard was 7px wider than a 390px
// screen, and no route in the list above would have said so.
const ROLE_ROUTES: Record<string, string[]> = {
  admin: ['/admin', '/payroll', '/support'],
  manager: ['/finance'],
  employee: ['/finance'],
};

async function login(page: Page, p: Persona) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  // The Getting started checklist opens itself on a first sign-in and covers
  // the page — at a phone's width, the menu button included.
  // It opens a moment after the page does, so give it that moment.
  // Titled per role: "Getting started" for most, "Setting up your organisation" for admins.
  const gettingStarted = page.getByRole('dialog', { name: /Getting started|Setting up your organisation/ });
  await gettingStarted.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  if (await gettingStarted.isVisible()) {
    await gettingStarted.getByRole('button', { name: 'Close' }).last().click();
    await expect(gettingStarted).toBeHidden();
  }
}

/** Elements that stick out past the right edge of the screen, outside any scroll container. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const pageScrolls = document.documentElement.scrollWidth > width + 1;
    const offenders: string[] = [];
    if (pageScrolls) {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.right <= width + 1) continue;
        // Inside something that scrolls sideways on its own: allowed.
        let parent = el.parentElement;
        let contained = false;
        while (parent && parent !== document.body) {
          const style = getComputedStyle(parent);
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { contained = true; break; }
          parent = parent.parentElement;
        }
        if (!contained) offenders.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`.slice(0, 120));
      }
    }
    // Text that runs past the right edge of the screen, whether or not the
    // page scrolls because of it: an email in a large stat card overflowed
    // its card while the page width stayed put, so "does the page scroll?"
    // alone passed it. Text inside something that scrolls sideways on its own
    // (a wide table) is allowed, as above.
    const cutOff: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.width === 0 || box.right <= width + 1) continue;
      let parent = node.parentElement;
      let scrolls = false;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') { scrolls = true; break; }
        if (/(auto|scroll)/.test(style.overflowX)) { scrolls = true; break; }
        // Shortened on purpose with an ellipsis ("truncate"): a decision,
        // not an overflow. The reader sees "…", not a word cut in half.
        if (style.textOverflow === 'ellipsis' && style.overflowX !== 'visible') { scrolls = true; break; }
        parent = parent.parentElement;
      }
      if (!scrolls) cutOff.push(`"${node.textContent.trim().slice(0, 40)}" ends at ${Math.round(box.right)}px`);
    }
    return {
      pageScrolls: pageScrolls || cutOff.length > 0,
      scrollWidth: document.documentElement.scrollWidth,
      width,
      offenders: [...offenders.slice(0, 5), ...cutOff.slice(0, 5)],
    };
  });
}

for (const width of WIDTHS) {
  test(`no page scrolls sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, persona());
    const problems: string[] = [];
    for (const route of [...ROUTES, ...(ROLE_ROUTES[persona().role] ?? [])]) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
      const result = await overflow(page);
      if (result.pageScrolls) {
        problems.push(`${route}: page is ${result.scrollWidth}px wide on a ${result.width}px screen — ${result.offenders.join(', ')}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

// The Super Admin's own pages, once: they are nobody's role project, and the
// Admin dashboard's audit log and cross-organisation user list are theirs.
test('the Super Admin’s pages fit a 390px screen', async ({ page }) => {
  test.skip(persona().role !== 'admin', 'runs once, from the admin project');
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page, SUPER_ADMIN as Persona);
  const problems: string[] = [];
  for (const route of ['/admin', '/organizations', '/support']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
    const result = await overflow(page);
    if (result.pageScrolls) {
      problems.push(`${route}: page is ${result.scrollWidth}px wide on a ${result.width}px screen — ${result.offenders.join(', ')}`);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

test('the navigation opens and closes from the menu button on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, persona());
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(menu).toBeVisible();
  await menu.click();
  const dashboardLink = page.getByRole('link', { name: 'Dashboard' }).first();
  await expect(dashboardLink).toBeInViewport();
  await page.getByRole('button', { name: 'Close navigation menu' }).click();
  await expect(dashboardLink).not.toBeInViewport();
});
