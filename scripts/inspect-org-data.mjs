import { chromium } from '@playwright/test';

async function inspect() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://modcon-hr.vercel.app/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#username', 'mintstudios823@gmail.com');
  await page.fill('#password', 'Eagleeye@123');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 30000 });
  await page.waitForTimeout(2500);

  const employeesOverlay = await page.evaluate(() => {
    const orgKey = sessionStorage.getItem('modcon.hr.activeOrgKey');
    const empKey = `modcon.hr.customEmployees.overlay::org:${orgKey}`;
    const attKey = `modcon.hr.attendanceRecords.overlay::org:${orgKey}`;
    return {
      employees: JSON.parse(localStorage.getItem(empKey) || '[]'),
      attendance: JSON.parse(localStorage.getItem(attKey) || '[]'),
      profile: JSON.parse(localStorage.getItem(`modcon.hr.companyProfile::org:${orgKey}`) || '{}'),
    };
  });

  console.log('Employees in overlay:', JSON.stringify(employeesOverlay.employees, null, 2));
  console.log('Sample attendance in overlay:', JSON.stringify(employeesOverlay.attendance.slice(0, 3), null, 2));
  console.log('Company Profile in overlay:', JSON.stringify(employeesOverlay.profile, null, 2));

  await browser.close();
}

inspect().catch(console.error);
