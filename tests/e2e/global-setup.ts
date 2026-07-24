import { FIREBASE_API_KEY, TEST_EMAIL, TEST_PASSWORD } from './config';

/**
 * Ensure the dedicated E2E test account exists in Firebase Auth before the
 * suite runs. Idempotent: if the account already exists we simply move on.
 */
async function globalSetup() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        returnSecureToken: true,
      }),
    });
    if (res.ok) {
      console.log(`[e2e] Provisioned test account ${TEST_EMAIL}`);
      return;
    }
    const data = (await res.json()) as { error?: { message?: string } };
    const message = data.error?.message ?? '';
    if (message.includes('EMAIL_EXISTS')) {
      console.log(`[e2e] Test account ${TEST_EMAIL} already exists`);
      return;
    }
    throw new Error(`Failed to provision test account: ${message}`);
  } catch (err) {
    console.error('[e2e] global-setup could not reach Firebase Auth:', err);
    throw err;
  }
}

export default globalSetup;
