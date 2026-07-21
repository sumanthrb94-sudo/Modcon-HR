/**
 * Seeds the Firebase Auth Emulator with a test account before the
 * authenticated e2e suite runs. Talks to the emulator's REST API directly —
 * no real Firebase project or network access involved.
 */
const AUTH_EMULATOR_HOST = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = 'http://127.0.0.1:8080';
const PROJECT_ID = 'modcon-hr';

// Matches ADMIN_EMAILS in src/lib/auth.tsx, so this account is granted the
// admin role automatically on first sign-in.
export const TEST_ADMIN_EMAIL = 'sumanthbolla97@gmail.com';
export const TEST_ADMIN_PASSWORD = 'test-password-123';

export const TEST_EMPLOYEE_EMAIL = 'e2e-employee@example.com';
export const TEST_EMPLOYEE_PASSWORD = 'test-password-123';

async function ensureUser(email: string, password: string) {
    const signUpUrl = `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
    const res = await fetch(signUpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (res.ok) return;

    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message ?? '';
    if (!message.includes('EMAIL_EXISTS')) {
        throw new Error(`Failed to seed test user ${email}: ${res.status} ${JSON.stringify(body)}`);
    }
}

export default async function globalSetup() {
    // Clear any state left over from a previous run so tests are hermetic.
    await fetch(
        `${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
        { method: 'DELETE' },
    );
    await fetch(
        `${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
        { method: 'DELETE' },
    );

    await ensureUser(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    await ensureUser(TEST_EMPLOYEE_EMAIL, TEST_EMPLOYEE_PASSWORD);
}
