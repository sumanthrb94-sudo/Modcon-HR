import { chromium } from '@playwright/test';

async function checkAttendanceState() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://modcon-hr.vercel.app/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#username', 'mintstudios823@gmail.com');
  await page.fill('#password', 'Eagleeye@123');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.href.includes('/login'));
  await page.waitForTimeout(2000);

  const res = await page.evaluate(() => {
    const orgKey = sessionStorage.getItem('modcon.hr.activeOrgKey');
    const attKey = `modcon.hr.attendanceRecords.overlay::org:${orgKey}`;
    const raw = localStorage.getItem(attKey);
    const parsed = raw ? JSON.parse(raw) : [];

    const recsForToday = parsed.filter(item => item.record?.date === '2026-09-29');
    const allDates = [...new Set(parsed.map(item => item.record?.date))].sort();

    return {
      orgKey,
      totalOverlayItems: parsed.length,
      sampleItem: parsed[0],
      datesCount: allDates.length,
      sampleDates: allDates.slice(0, 10),
      recsForToday,
    };
  });

  console.log('ATTENDANCE STATE:', JSON.stringify(res, null, 2));
  await browser.close();
}

checkAttendanceState().catch(console.error);
