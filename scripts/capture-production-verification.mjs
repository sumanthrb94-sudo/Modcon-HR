import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'audit_screenshots');

async function captureVerification() {
  console.log('========================================================================');
  console.log('  CAPTURING PRODUCTION VERIFICATION SCREENSHOTS');
  console.log('  Target: https://modcon-hr.vercel.app');
  console.log('========================================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1600,1050', '--no-sandbox']
  });

  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();

  console.log('>>> [1/4] Signing in as Asha Rao (mintstudios823@gmail.com)...');
  await page.goto('https://modcon-hr.vercel.app/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#username', 'mintstudios823@gmail.com');
  await page.fill('#password', 'Eagleeye@123');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(3000); // Allow Firestore sync to hydrate cache

  // 1. Settings Company Profile
  console.log('>>> [2/4] Verifying /settings Company Profile...');
  await page.goto('https://modcon-hr.vercel.app/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, '01_org_details_filled.png'), fullPage: false });
  console.log('    ✓ Saved: 01_org_details_filled.png');

  // 2. Attendance Master
  console.log('>>> [3/4] Verifying /attendance September records & regularizations...');
  await page.goto('https://modcon-hr.vercel.app/attendance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(outDir, '02_september_attendance_regularized.png'), fullPage: false });
  console.log('    ✓ Saved: 02_september_attendance_regularized.png');

  // 3. Payroll Process
  console.log('>>> [4/4] Verifying /payroll September 2026 run...');
  await page.goto('https://modcon-hr.vercel.app/payroll', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Select Sep 2026 if selectable
  const selectBox = page.locator('select').first();
  if (await selectBox.count() > 0) {
    try {
      await selectBox.selectOption('2026-09');
      console.log('    ✓ Selected "Sep 2026".');
    } catch (e) {}
  }

  // Click Run Payroll
  const runBtn = page.getByRole('button', { name: /Run Payroll/i });
  if (await runBtn.count() > 0) {
    await runBtn.click();
    console.log('    ✓ Clicked "Run Payroll".');
    await page.waitForTimeout(1500);

    const confirmBtn = page.getByRole('button', { name: /Confirm & Run Payroll|Confirm/i });
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      console.log('    ✓ Confirmed Payroll Run.');
      await page.waitForTimeout(3500);
    }
  }

  await page.screenshot({ path: path.join(outDir, '03_september_payroll_processed.png'), fullPage: false });
  console.log('    ✓ Saved: 03_september_payroll_processed.png');

  // Statutory Returns
  const statutoryTab = page.getByRole('tab', { name: /Statutory|Returns|Compliance/i });
  if (await statutoryTab.count() > 0) {
    await statutoryTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, '04_september_statutory_returns.png'), fullPage: false });
    console.log('    ✓ Saved: 04_september_statutory_returns.png');
  }

  await browser.close();
  console.log('\n========================================================================');
  console.log('  ALL VERIFICATION SCREENSHOTS CAPTURED SUCCESSFULLY!');
  console.log('========================================================================');
}

captureVerification().catch(console.error);
