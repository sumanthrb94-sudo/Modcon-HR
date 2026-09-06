import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/modconhr-b2789/accounts:query';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [err]', m.text().slice(0, 140)); });

await page.goto(`${BASE}/login`);
await page.locator('input[type=email]').fill('hr@modcon.test');
await page.locator('input[type=password]').fill('Sandbox@123');
await page.locator('button[type=submit]').click();
await page.waitForTimeout(5000);

// Open an employee who has no account.
await page.goto(`${BASE}/employees`);
await page.locator('button[title="List view"]').click();
await page.locator('table tbody tr').nth(4).click();
await page.waitForTimeout(2000);
const name = (await page.locator('h2').first().textContent())?.trim();
console.log('employee:', name, '| url:', page.url());

const btn = page.getByRole('button', { name: 'Create login' });
console.log('Create login button visible:', await btn.count());
await btn.first().click();
const dlg = page.getByRole('dialog');
await dlg.waitFor({ timeout: 10000 });
console.log('sign-in address shown:', (await dlg.locator('p.font-mono').first().textContent())?.trim());
console.log('roles offered:', (await dlg.getByLabel('Role').locator('option').allTextContents()).join(', '));
await dlg.getByRole('button', { name: 'Create login' }).click();
await page.waitForTimeout(9000);
console.log('outcome:', (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 420));

const accounts = await (await fetch(AUTH, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}' })).json();
console.log('emulator accounts:', (accounts.userInfo ?? []).map((u) => u.email).join(', '));
await browser.close();
