import { test, expect, type Page } from '@playwright/test';
import { type Persona } from './config';

/**
 * Every control has a name, and headings do not skip a level (G11, R4-M4).
 *
 * QA found it systemic: two icon-only header buttons and the filter dropdowns
 * had no accessible name on any route, so a screen reader announced "button"
 * and "combo box" and nothing else, and card titles jumped from the page's h1
 * straight to h3. The fixes are in the shared components — Topbar, Sidebar,
 * Select, SearchInput, CardHeader — so this walks the main pages and checks
 * what they render, rather than checking the components one by one: a page
 * that bypasses a shared component is exactly what would slip past.
 *
 * Runs once per role project, since each role sees different controls.
 */

function persona(): Persona {
  const p = test.info().project.metadata?.persona as Persona | undefined;
  if (!p) throw new Error('No persona configured for this project');
  return p;
}

const ROUTES = ['/', '/leave', '/attendance', '/expenses', '/helpdesk', '/employees', '/assets', '/settings'];

async function login(page: Page, p: Persona) {
  await page.goto('/login');
  await page.locator('#username').fill(p.email);
  await page.locator('#password').fill(p.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 20_000 });
}

/** Visible controls with no accessible name, and heading levels that skip. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const h = el as HTMLElement;
      if (h.closest('[aria-hidden="true"]')) return false;
      const box = h.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(h).visibility !== 'hidden';
    };
    const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const nameOf = (el: Element) => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim();
        if (t) return t;
      }
      const labels = (el as HTMLInputElement).labels;
      if (labels && labels.length) {
        const t = Array.from(labels).map(text).join(' ').trim();
        if (t) return t;
      }
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
        const t = text(el);
        if (t) return t;
        const alt = el.querySelector('img[alt]')?.getAttribute('alt');
        if (alt?.trim()) return alt.trim();
      }
      return (el.getAttribute('title') ?? '').trim();
    };

    const unnamed = Array.from(
      document.querySelectorAll('button, a[href], [role="button"], select, textarea, input:not([type="hidden"])'),
    )
      .filter(visible)
      .filter((el) => !nameOf(el))
      .map((el) => el.outerHTML.slice(0, 160));

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter(visible)
      .map((h) => ({ level: Number(h.tagName[1]), text: text(h).slice(0, 60) }));
    const skips: string[] = [];
    let previous = 0;
    for (const h of headings) {
      if (previous && h.level > previous + 1) skips.push(`h${previous} → h${h.level} "${h.text}"`);
      previous = h.level;
    }
    return { unnamed, skips };
  });
}

test('every control on the main pages has a name, and no heading skips a level', async ({ page }) => {
  await login(page, persona());
  const problems: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    // Pages are lazy-loaded; wait for the route's own h1 before reading it.
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
    const { unnamed, skips } = await audit(page);
    for (const el of unnamed) problems.push(`${route}: unnamed control ${el}`);
    for (const skip of skips) problems.push(`${route}: heading skip ${skip}`);
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
