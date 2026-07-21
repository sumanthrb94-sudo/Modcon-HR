import { defineConfig, devices } from '@playwright/test';

// Authenticated e2e suite: runs against a Vite dev server wired to the local
// Firebase Emulator Suite (see e2e/emulator/global-setup.ts), so it never
// touches the real production Firebase project.
export default defineConfig({
    testDir: './e2e/auth',
    globalSetup: './e2e/emulator/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    timeout: 45_000,
    use: {
        baseURL: 'http://localhost:5174',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                },
            },
        },
    ],
    webServer: [
        {
            command: 'npm run emulators',
            url: 'http://127.0.0.1:9099',
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
        {
            command: 'npm run dev:emulator -- --port 5174 --strictPort',
            url: 'http://localhost:5174',
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
    ],
});
