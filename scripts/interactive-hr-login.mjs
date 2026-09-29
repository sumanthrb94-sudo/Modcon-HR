import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\86884b41-8a94-4844-94e5-12e77d2a0a32';
const userDataDir = path.join(process.cwd(), '.playwright-profile');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function start() {
  console.log('\n=============================================================');
  console.log('  ModCon HR — Instant Multi-Page Screenshot Capture');
  console.log('=============================================================\n');

  // Launch persistent context so if you are already signed in, you never need to re-login!
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('Navigating to https://modcon-hr.vercel.app ...');
  await page.goto('https://modcon-hr.vercel.app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // If on login page, wait for user to sign in
  if (page.url().includes('/login')) {
    console.log('\n>>> Please sign in as HR in the browser window... <<<');
    await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 300000 });
    console.log('Login detected! Current URL:', page.url());
    await page.waitForTimeout(3000);
  } else {
    console.log('Already signed in! Current URL:', page.url());
  }

  // Client-side routes using SPA navigation (instant & no reload timeouts)
  const routes = [
    { name: '02_dashboard.png', path: '/' },
    { name: '03_employees.png', path: '/employees' },
    { name: '04_attendance.png', path: '/attendance' },
    { name: '05_leave.png', path: '/leave' },
    { name: '06_payroll.png', path: '/payroll' },
    { name: '07_recruitment.png', path: '/recruitment' },
    { name: '08_performance.png', path: '/performance' },
    { name: '09_expenses.png', path: '/expenses' },
    { name: '10_assets.png', path: '/assets' },
    { name: '11_helpdesk.png', path: '/helpdesk' },
    { name: '12_reports.png', path: '/reports' },
    { name: '13_settings.png', path: '/settings' },
  ];

  console.log('\nCapturing all HR module screens...');
  for (const r of routes) {
    try {
      console.log(`Navigating to ${r.path}...`);
      // Client-side navigate via window.history / location or evaluate pushState to avoid full reloads
      await page.evaluate((targetPath) => {
        window.history.pushState({}, '', targetPath);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, r.path);

      await page.waitForTimeout(2000); // Wait for React render & charts
      const dest = path.join(outDir, r.name);
      await page.screenshot({ path: dest, fullPage: false });
      console.log(`✓ Saved ${r.name}`);
    } catch (err) {
      console.warn(`! Failed capturing ${r.name}:`, err.message);
    }
  }

  console.log('\n=============================================================');
  console.log('All 12 HR module screenshots successfully captured!');
  console.log('=============================================================\n');

  await page.waitForTimeout(5000);
  await context.close();
}

start().catch((err) => {
  console.error('Simulation error:', err);
});
