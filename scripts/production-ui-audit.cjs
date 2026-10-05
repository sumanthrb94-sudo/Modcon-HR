const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://modcon-hr.vercel.app';
const OUTPUT = 'C:/Users/Dell/Downloads/ModCon-HR-Production-Audit/authenticated';
const routes = [
  ['Today / Inbox', '/dashboard'],
  ['People & Documents', '/employees'],
  ['Attendance', '/attendance'],
  ['My Attendance', '/my-attendance'],
  ['Leave', '/leave'],
  ['Payroll Readiness', '/payroll'],
  ['Finance & Payslips', '/finance'],
  ['Approvals', '/approvals'],
  ['Documents', '/documents'],
  ['The Board', '/board'],
  ['Recruitment', '/recruitment'],
  ['Onboarding', '/onboarding'],
  ['Performance', '/performance'],
  ['Expenses', '/expenses'],
  ['Assets', '/assets'],
  ['Helpdesk', '/helpdesk'],
  ['Reports', '/reports'],
  ['Admin', '/admin'],
  ['Settings', '/settings'],
  ['Support', '/support'],
];
const profiles = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const results = [];
  let activeErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') activeErrors.push(`console: ${msg.text()}`); });
  page.on('pageerror', (err) => activeErrors.push(`page: ${err.message}`));

  for (const [profile, viewport] of profiles) {
    await page.setViewportSize(viewport);
    for (const [label, route] of routes) {
      activeErrors = [];
      const started = Date.now();
      let response = null;
      let navigationError = '';
      try {
        response = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1200);
      } catch (error) {
        navigationError = error.message;
        await page.waitForTimeout(1000);
      }
      const metrics = await page.evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const labelOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
        const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="link"]')].filter(visible);
        const unnamed = interactive.filter((el) => !labelOf(el) && !(el.tagName === 'INPUT' && el.getAttribute('placeholder'))).map((el) => el.outerHTML.slice(0, 180));
        const smallTargets = interactive.map((el) => {
          const r = el.getBoundingClientRect();
          return { label: labelOf(el) || el.tagName, width: Math.round(r.width), height: Math.round(r.height) };
        }).filter((x) => x.width < 44 || x.height < 44);
        const clipped = [...document.querySelectorAll('main *')].filter(visible).filter((el) => {
          const s = getComputedStyle(el);
          return (s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2;
        }).slice(0, 15).map((el) => ({ label: labelOf(el), tag: el.tagName, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }));
        const headings = [...document.querySelectorAll('h1,h2')].filter(visible).map((el) => el.innerText.trim()).filter(Boolean).slice(0, 8);
        return {
          title: document.title,
          headings,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          unnamed,
          smallTargets: smallTargets.slice(0, 25),
          smallTargetCount: smallTargets.length,
          clipped,
          bodyText: document.body.innerText.slice(0, 500),
        };
      });
      const screenshot = `${profile}-${slug(label)}.png`;
      await page.screenshot({ path: path.join(OUTPUT, screenshot), fullPage: true });
      const entry = {
        profile, viewport, label, route, url: page.url(), status: response?.status() ?? null,
        durationMs: Date.now() - started, navigationError, consoleErrors: [...new Set(activeErrors)],
        screenshot, ...metrics,
      };
      results.push(entry);
      console.log(`[${profile}] ${label}: status=${entry.status} overflow=${entry.horizontalOverflow} unnamed=${entry.unnamed.length} small=${entry.smallTargetCount} errors=${entry.consoleErrors.length}`);
    }
  }

  fs.writeFileSync(path.join(OUTPUT, 'audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), origin: ORIGIN, results }, null, 2));
  const rows = results.map((r) => {
    const severity = r.navigationError || r.consoleErrors.length || r.horizontalOverflow || r.unnamed.length ? 'issue' : (r.profile === 'mobile' && r.smallTargetCount > 5 ? 'warn' : 'pass');
    return `<tr class="${severity}"><td>${esc(r.profile)}</td><td>${esc(r.label)}</td><td>${r.status ?? '—'}</td><td>${r.horizontalOverflow ? `Yes (${r.documentWidth}px)` : 'No'}</td><td>${r.unnamed.length}</td><td>${r.smallTargetCount}</td><td>${r.clipped.length}</td><td>${r.consoleErrors.length}</td><td><a href="${esc(r.screenshot)}">View</a></td></tr>`;
  }).join('');
  const details = results.filter((r) => r.navigationError || r.consoleErrors.length || r.horizontalOverflow || r.unnamed.length || r.clipped.length).map((r) => `<section><h2>${esc(r.profile)} · ${esc(r.label)}</h2><p><a href="${esc(r.screenshot)}">Screenshot</a> · <code>${esc(r.route)}</code></p>${r.navigationError ? `<h3>Navigation</h3><pre>${esc(r.navigationError)}</pre>` : ''}${r.consoleErrors.length ? `<h3>Console errors</h3><pre>${esc(r.consoleErrors.join('\n'))}</pre>` : ''}${r.unnamed.length ? `<h3>Unnamed controls</h3><pre>${esc(r.unnamed.join('\n'))}</pre>` : ''}${r.clipped.length ? `<h3>Potential clipping</h3><pre>${esc(JSON.stringify(r.clipped, null, 2))}</pre>` : ''}</section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ModCon HR Authenticated UI Audit</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#171717}h1{font-size:28px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5;position:sticky;top:0}.issue{background:#fff0f0}.warn{background:#fff9e8}.pass{background:#f0fff4}section{border:1px solid #ddd;border-radius:14px;padding:18px;margin:18px 0}pre{white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:10px;overflow:auto}code{background:#f2f2f2;padding:2px 5px;border-radius:4px}</style></head><body><h1>ModCon HR authenticated production UI audit</h1><p>Read-only route audit of <a href="${ORIGIN}">${ORIGIN}</a>. Desktop 1440×900 and mobile 390×844.</p><table><thead><tr><th>Viewport</th><th>Screen</th><th>HTTP</th><th>Overflow</th><th>Unnamed</th><th>Small targets</th><th>Clipped</th><th>Console</th><th>Screenshot</th></tr></thead><tbody>${rows}</tbody></table>${details}</body></html>`;
  fs.writeFileSync(path.join(OUTPUT, 'audit.html'), html);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`file:///${path.join(OUTPUT, 'audit.html').replace(/\\/g, '/')}`);
  console.log(`AUDIT_REPORT=${path.join(OUTPUT, 'audit.html')}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
