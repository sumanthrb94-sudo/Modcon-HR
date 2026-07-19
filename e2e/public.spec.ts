import { test, expect } from '@playwright/test';

// NOTE: These tests only exercise routes/behavior that resolve on the client
// without depending on a live Firebase Auth round-trip. Auth in this app is
// wired to a real Firebase project (no emulator config in the repo), so
// sign-in-dependent flows can't be verified in an isolated CI/sandbox
// environment that restricts outbound access to Google APIs. See the
// production-readiness notes for details.

test.describe('Unauthenticated access', () => {
    test('root redirects to login', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { name: /sign in to continue/i })).toBeVisible();
    });

    test('protected routes redirect to login', async ({ page }) => {
        test.slow();
        for (const path of ['/employees', '/payroll', '/admin', '/settings']) {
            await page.goto(path);
            await expect(page).toHaveURL(/\/login$/);
        }
    });

    test('unknown route on the protected shell redirects to login rather than rendering', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        // Unauthenticated users get bounced to /login before the 404 page can
        // render, since NotFound lives inside the protected layout.
        await expect(page).toHaveURL(/\/login$/);
    });
});

test.describe('Login page', () => {
    test('renders the sign-in form', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByLabel('Email')).toBeVisible();
        await expect(page.getByLabel('Password')).toBeVisible();
        await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('toggles to sign-up form and back', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('button', { name: /sign up/i }).click();
        await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
        await expect(page.getByLabel('Full name')).toBeVisible();

        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page.getByRole('heading', { name: /sign in to continue/i })).toBeVisible();
    });

    test('enforces the minimum password length on the client', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '6');
    });

    test('requires email and password before submit is allowed', async ({ page }) => {
        await page.goto('/login');
        const email = page.getByLabel('Email');
        const password = page.getByLabel('Password');
        await expect(email).toHaveAttribute('required', '');
        await expect(password).toHaveAttribute('required', '');
    });

    test('loads with no same-origin console errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() !== 'error') return;
            // Ignore failures to reach third-party hosts (fonts/analytics/etc.) -
            // those are network-environment dependent, not app bugs.
            if (/Failed to load resource/i.test(msg.text())) return;
            errors.push(msg.text());
        });

        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');

        expect(errors, `Console/page errors on /login:\n${errors.join('\n')}`).toEqual([]);
    });
});
