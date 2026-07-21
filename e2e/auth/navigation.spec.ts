import { test, expect } from './fixtures';

test.describe('Admin sign-in', () => {
    test('lands on the dashboard after signing in', async ({ adminPage }) => {
        await expect(adminPage).toHaveURL('/');
        await expect(adminPage.getByRole('heading', { name: /good (morning|afternoon|evening)/i }))
            .toBeVisible({ timeout: 15_000 });
    });

    for (const path of [
        '/employees',
        '/attendance',
        '/leave',
        '/payroll',
        '/recruitment',
        '/onboarding',
        '/performance',
        '/expenses',
        '/assets',
        '/helpdesk',
        '/reports',
        '/settings',
        '/admin',
    ]) {
        test(`${path} renders for an admin without crashing`, async ({ adminPage }) => {
            const errors: string[] = [];
            adminPage.on('pageerror', (err) => errors.push(err.message));

            await adminPage.goto(path);
            await expect(adminPage).toHaveURL(path);
            // The router should never fall through to the protected-shell 404.
            await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);

            expect(errors, `Uncaught page errors on ${path}:\n${errors.join('\n')}`).toEqual([]);
        });
    }

    test('sees the admin-only Database tab in Settings', async ({ adminPage }) => {
        await adminPage.goto('/settings');
        await adminPage.getByRole('button', { name: 'Database' }).click();
        await expect(adminPage.getByRole('button', { name: /seed firestore/i })).toBeVisible();
    });

    test('can sign out back to the login page', async ({ adminPage }) => {
        await adminPage.getByRole('button', { name: /sign out/i }).click();
        await expect(adminPage).toHaveURL(/\/login$/, { timeout: 10_000 });
    });
});

test.describe('Employee (non-admin) sign-in', () => {
    test('cannot see or reach the admin dashboard', async ({ employeePage }) => {
        await employeePage.goto('/admin');
        // RequireAdmin redirects non-admins back to "/".
        await expect(employeePage).toHaveURL('/', { timeout: 10_000 });
    });

    test('does not see the Database tab in Settings', async ({ employeePage }) => {
        await employeePage.goto('/settings');
        await expect(employeePage.getByRole('button', { name: 'Database' })).toHaveCount(0);
    });
});
