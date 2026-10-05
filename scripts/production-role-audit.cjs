const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://modcon-hr.vercel.app';
const OUTPUT = 'C:/Users/Dell/Downloads/ModCon-HR-Production-Audit/role-matrix';
const accounts = JSON.parse(process.env.AUDIT_ACCOUNTS_JSON || '[]');
const keyRoutes = ['/dashboard', '/employees', '/attendance', '/my-attendance', '/leave', '/payroll', '/finance', '/approvals', '/documents', '/settings'];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const log = (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(OUTPUT, 'progress.log'), `${line}\n`);
};

(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'progress.log'), '');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const reportContext = browser.contexts()[0];
  const reportPage = reportContext.pages()[0];
  const results = [];

  for (const account of accounts) {
    log(`START ${account.org} · ${account.expectedRole} · ${account.email}`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    let login = 'failed';
    let failure = '';
    const routeResults = [];
    let nav = [];
    let identity = '';
    let notification = { found: false, text: '' };
    try {
      await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.locator('#username').fill(account.email);
      await page.locator('#password').fill(account.password);
      const submit = page.getByRole('button', { name: /sign in|log in|login/i }).last();
      await submit.click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
      await page.waitForFunction(() => document.body.innerText.trim().length > 100, null, { timeout: 15000 });
      await page.waitForTimeout(500);
      login = 'passed';
      identity = (await page.locator('body').innerText()).slice(0, 1200);
      nav = await page.locator('a[href]').evaluateAll((links) => links.filter((a) => a.offsetParent !== null).map((a) => ({ text: (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), path: new URL(a.href).pathname })).filter((x, i, arr) => x.text && arr.findIndex((y) => y.text === x.text && y.path === x.path) === i));
      const notificationsButton = page.getByRole('button', { name: /notifications/i });
      if (await notificationsButton.count()) {
        notification.found = true;
        await notificationsButton.first().click();
        await page.waitForTimeout(400);
        notification.text = (await page.locator('body').innerText()).slice(-1500);
        await page.screenshot({ path: path.join(OUTPUT, `${slug(account.org)}-${slug(account.expectedRole)}-notifications.png`) });
        await page.keyboard.press('Escape');
      }
      for (const route of keyRoutes) {
        const visibleInNav = nav.some((item) => item.path === route);
        let status = null;
        let finalPath = '';
        let heading = '';
        let denied = false;
        let overflow = false;
        try {
          const response = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          status = response?.status() ?? null;
          await page.waitForTimeout(600);
          finalPath = new URL(page.url()).pathname;
          heading = await page.locator('h1,h2').first().innerText().catch(() => '');
          const body = await page.locator('body').innerText();
          denied = /access denied|not authorized|permission|forbidden/i.test(body.slice(0, 1800));
          overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        } catch (error) {
          routeResults.push({ route, visibleInNav, error: error.message });
          continue;
        }
        routeResults.push({ route, visibleInNav, status, finalPath, heading, denied, overflow });
        log(`ROUTE ${account.org} · ${account.expectedRole} · ${route} · nav=${visibleInNav} · final=${finalPath} · denied=${denied} · overflow=${overflow}`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${ORIGIN}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(800);
      const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 2, width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
      await page.screenshot({ path: path.join(OUTPUT, `${slug(account.org)}-${slug(account.expectedRole)}-mobile.png`), fullPage: false });
      results.push({ ...account, password: undefined, login, identity, nav, notification, routeResults, mobile, consoleErrors: [...new Set(consoleErrors)] });
    } catch (error) {
      failure = error.message;
      results.push({ ...account, password: undefined, login, failure, identity, nav, notification, routeResults, consoleErrors: [...new Set(consoleErrors)] });
      log(`FAIL ${account.org} · ${account.expectedRole} · ${account.email} · ${failure}`);
    }
    log(`DONE ${account.org} · ${account.expectedRole} · login=${login}`);
  }

  fs.writeFileSync(path.join(OUTPUT, 'role-matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const cards = results.map((r) => `<section class="${r.login === 'passed' ? 'pass' : 'fail'}"><h2>${esc(r.org)} · ${esc(r.expectedRole)}</h2><p>${esc(r.email)} · Login: <strong>${esc(r.login)}</strong></p>${r.failure ? `<pre>${esc(r.failure)}</pre>` : ''}<p>Notifications: ${r.notification?.found ? 'panel opened and captured' : 'control not found'} · Console errors: ${r.consoleErrors?.length || 0}</p><p>Mobile overflow: ${r.mobile?.overflow ? `Yes (${r.mobile.documentWidth}px)` : 'No'}</p><table><thead><tr><th>Route</th><th>In navigation</th><th>HTTP</th><th>Final path</th><th>Denied</th><th>Overflow</th></tr></thead><tbody>${(r.routeResults || []).map((x) => `<tr><td>${esc(x.route)}</td><td>${x.visibleInNav ? 'Yes' : 'No'}</td><td>${x.status ?? '—'}</td><td>${esc(x.finalPath || '')}</td><td>${x.denied ? 'Yes' : 'No'}</td><td>${x.overflow ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ModCon HR Live Role Matrix</title><style>body{font:14px/1.45 system-ui;margin:28px;color:#171717}h1{font-size:28px}section{border:1px solid #ddd;border-radius:16px;padding:18px;margin:18px 0}.pass{border-left:6px solid #169c52}.fail{border-left:6px solid #d33}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f4f4f4}pre{white-space:pre-wrap;background:#f7f7f7;padding:10px}</style></head><body><h1>ModCon HR live organization and role simulation</h1><p>Production read-only audit. Passwords are excluded. No records were submitted or changed.</p>${cards}</body></html>`;
  const reportPath = path.join(OUTPUT, 'role-matrix.html');
  fs.writeFileSync(reportPath, html);
  await reportPage.goto(`file:///${reportPath.replace(/\\/g, '/')}`);
  log(`COMPLETE report=${reportPath}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
