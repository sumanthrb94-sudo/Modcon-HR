import { test as base, expect, type Page } from '@playwright/test';
import {
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    TEST_EMPLOYEE_EMAIL,
    TEST_EMPLOYEE_PASSWORD,
} from '../emulator/global-setup';

async function login(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL('/', { timeout: 20_000 });
}

export const test = base.extend<{ adminPage: Page; employeePage: Page }>({
    adminPage: async ({ page }, use) => {
        await login(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
        await use(page);
    },
    employeePage: async ({ page }, use) => {
        await login(page, TEST_EMPLOYEE_EMAIL, TEST_EMPLOYEE_PASSWORD);
        await use(page);
    },
});

export { expect };
