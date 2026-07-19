import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:4173',
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
    webServer: {
        command: 'npm run preview -- --port 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
