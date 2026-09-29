import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\86884b41-8a94-4844-94e5-12e77d2a0a32';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('Launching Playwright Chromium browser...');
  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('Navigating to production: https://modcon-hr.vercel.app');
  await page.goto('https://modcon-hr.vercel.app', { waitUntil: 'networkidle' });

  console.log('Current URL:', page.url());
  const screenshot1 = path.join(outDir, '01_production_login.png');
  await page.screenshot({ path: screenshot1, fullPage: true });
  console.log('Saved screenshot 1:', screenshot1);

  // Check if careers link is there
  const careersLink = await page.$('a[href*="/careers"]');
  if (careersLink) {
    console.log('Found careers link, capturing careers preview...');
  }

  // Check page title and headings
  const title = await page.title();
  console.log('Page Title:', title);

  await page.waitForTimeout(3000);
  await browser.close();
  console.log('Simulation complete.');
}

run().catch((err) => {
  console.error('Error running simulation:', err);
  process.exit(1);
});
