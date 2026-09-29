// ===========================================================================
// Comprehensive Desktop & Mobile UI/UX Audit for Modcon-HR Production
// ===========================================================================
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://modcon-hr.vercel.app';
const OUT_DIR = path.join(process.cwd(), 'audit_screenshots');
const DESKTOP_DIR = path.join(OUT_DIR, 'desktop');
const MOBILE_DIR = path.join(OUT_DIR, 'mobile');

fs.mkdirSync(DESKTOP_DIR, { recursive: true });
fs.mkdirSync(MOBILE_DIR, { recursive: true });

const PAGES_TO_AUDIT = [
  { name: '01_login', path: '/login', requiresAuth: false },
  { name: '02_dashboard', path: '/', requiresAuth: true },
  { name: '03_attendance_master', path: '/attendance', requiresAuth: true },
  { name: '04_my_attendance', path: '/my-attendance', requiresAuth: true },
  { name: '05_leave_management', path: '/leave', requiresAuth: true, action: 'open_apply_leave' },
  { name: '06_payroll', path: '/payroll', requiresAuth: true, action: 'open_payslip_modal' },
  { name: '07_employees_directory', path: '/employees', requiresAuth: true },
  { name: '08_expenses', path: '/expenses', requiresAuth: true },
  { name: '09_performance', path: '/performance', requiresAuth: true },
  { name: '10_recruitment', path: '/recruitment', requiresAuth: true },
  { name: '11_helpdesk', path: '/helpdesk', requiresAuth: true },
  { name: '12_settings', path: '/settings', requiresAuth: true },
];

async function runAudit() {
  console.log('========================================================================');
  console.log('  MODCON-HR COMPREHENSIVE DESKTOP & MOBILE RESPONSIVE UI AUDIT');
  console.log(`  Target: ${BASE_URL}`);
  console.log('========================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const auditResults = [];

  for (const mode of ['desktop', 'mobile']) {
    const isMobile = mode === 'mobile';
    const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const targetDir = isMobile ? MOBILE_DIR : DESKTOP_DIR;

    console.log(`\n========================================================================`);
    console.log(`  STARTING AUDIT: ${mode.toUpperCase()} VIEWPORT (${viewport.width}x${viewport.height})`);
    console.log(`========================================================================\n`);

    const context = await browser.newContext({
      viewport,
      userAgent: isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      isMobile,
      hasTouch: isMobile,
    });

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Login once per context
    console.log(`[${mode}] Logging in as mintstudios823@gmail.com...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Capture login screen before login
    await page.screenshot({ path: path.join(targetDir, '01_login.png'), fullPage: false });
    console.log(`  ✓ Captured: ${mode}/01_login.png`);

    await page.fill('#username', 'mintstudios823@gmail.com');
    await page.fill('#password', 'Eagleeye@123');
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log(`  ✓ Logged in successfully on ${mode}.`);
    } catch (e) {
      console.error(`  ✗ Login timeout on ${mode}:`, e.message);
    }

    // Dismiss any modal if open
    try {
      const dismissBtn = page.getByRole('button', { name: /Close|Dismiss|Done/i }).first();
      if (await dismissBtn.isVisible()) {
        await dismissBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {}

    // Audit each page
    for (const item of PAGES_TO_AUDIT) {
      if (!item.requiresAuth) continue;

      console.log(`[${mode}] Auditing ${item.name} (${item.path})...`);
      try {
        await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          return {
            hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            bodyScrollWidth: document.body.scrollWidth,
          };
        });

        // Specific actions like opening modals
        if (item.action === 'open_apply_leave') {
          // First capture base leave page
          await page.screenshot({ path: path.join(targetDir, `${item.name}.png`), fullPage: false });
          console.log(`  ✓ Captured: ${mode}/${item.name}.png`);

          // Open Apply Leave modal
          const applyBtn = page.getByRole('button', { name: /Apply Leave/i }).first();
          if (await applyBtn.isVisible()) {
            await applyBtn.click();
            await page.waitForTimeout(1000);

            // Fill dates to trigger Team Overlap preview
            const dateInputs = page.locator('input[type="date"]');
            if (await dateInputs.count() >= 2) {
              await dateInputs.nth(0).fill('2026-09-15');
              await dateInputs.nth(1).fill('2026-09-18');
              await page.waitForTimeout(800);
            }

            await page.screenshot({ path: path.join(targetDir, `${item.name}_modal_team_overlap.png`), fullPage: false });
            console.log(`  ✓ Captured: ${mode}/${item.name}_modal_team_overlap.png`);

            // Close modal
            const closeBtn = page.getByRole('button', { name: /Cancel|Close/i }).first();
            if (await closeBtn.isVisible()) await closeBtn.click();
            await page.waitForTimeout(500);
          }
          continue;
        }

        if (item.action === 'open_payslip_modal') {
          // Capture payroll page
          await page.screenshot({ path: path.join(targetDir, `${item.name}.png`), fullPage: false });
          console.log(`  ✓ Captured: ${mode}/${item.name}.png`);

          // Switch to Payslips tab if available
          const payslipsTab = page.getByRole('tab', { name: /Payslips/i }).or(page.getByText(/Payslips/i)).first();
          if (await payslipsTab.isVisible()) {
            await payslipsTab.click();
            await page.waitForTimeout(1200);

            // Click first payslip row or view button
            const firstRow = page.locator('tbody tr').first();
            if (await firstRow.isVisible()) {
              await firstRow.click();
              await page.waitForTimeout(1000);
              await page.screenshot({ path: path.join(targetDir, `${item.name}_take_home_ratio_drawer.png`), fullPage: false });
              console.log(`  ✓ Captured: ${mode}/${item.name}_take_home_ratio_drawer.png`);

              // Close modal
              const closeBtn = page.getByRole('button', { name: /Close|Cancel/i }).first();
              if (await closeBtn.isVisible()) await closeBtn.click();
              await page.waitForTimeout(500);
            }
          }
          continue;
        }

        // Standard page screenshot
        await page.screenshot({ path: path.join(targetDir, `${item.name}.png`), fullPage: false });
        console.log(`  ✓ Captured: ${mode}/${item.name}.png (Overflow: ${overflow.hasHorizontalScroll ? `⚠️ YES (${overflow.scrollWidth}px vs ${overflow.innerWidth}px)` : '🟢 NO'})`);

        auditResults.push({
          page: item.name,
          mode,
          path: item.path,
          overflow,
          consoleErrorsCount: consoleErrors.length,
        });
      } catch (err) {
        console.error(`  ✗ Failed to audit ${item.name} on ${mode}:`, err.message);
      }
    }

    await context.close();
  }

  await browser.close();

  console.log('\n========================================================================');
  console.log('  AUDIT COMPLETED! ALL SCREENSHOTS WRITTEN TO audit_screenshots/');
  console.log('========================================================================\n');

  fs.writeFileSync(
    path.join(OUT_DIR, 'audit_summary.json'),
    JSON.stringify(auditResults, null, 2),
    'utf-8',
  );
}

runAudit().catch((err) => {
  console.error('Audit script encountered an error:', err);
  process.exit(1);
});
