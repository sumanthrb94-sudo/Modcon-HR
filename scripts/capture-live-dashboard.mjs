import { chromium } from '@playwright/test';
import path from 'node:path';

const BASE_URL = 'https://modcon-hr.vercel.app';
const OUT_DIR = path.join(process.cwd(), 'audit_screenshots');

async function captureDashboard() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  for (const mode of ['desktop', 'mobile']) {
    const isMobile = mode === 'mobile';
    const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
    const page = await context.newPage();

    console.log(`[${mode}] Logging in to capture live home dashboard...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('#username', 'mintstudios823@gmail.com');
    await page.fill('#password', 'Eagleeye@123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 30000 });
    await page.waitForTimeout(3500);

    // Ensure we are at '/'
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const outPath = path.join(OUT_DIR, mode, '02_dashboard.png');
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`  ✓ Saved ${mode}/02_dashboard.png`);
    await context.close();
  }

  await browser.close();
}

captureDashboard().catch(console.error);
