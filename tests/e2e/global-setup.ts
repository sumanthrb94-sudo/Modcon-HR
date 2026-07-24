import { FIREBASE_API_KEY, PERSONAS } from './config';

/**
 * Ensure every dedicated E2E test account exists in Firebase Auth before the
 * suite runs. Idempotent: accounts that already exist are left as-is.
 */
async function provision(email: string, password: string) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (res.ok) {
    console.log(`[e2e] Provisioned test account ${email}`);
    return;
  }
  const data = (await res.json()) as { error?: { message?: string } };
  const message = data.error?.message ?? '';
  if (message.includes('EMAIL_EXISTS')) {
    console.log(`[e2e] Test account ${email} already exists`);
    return;
  }
  throw new Error(`Failed to provision ${email}: ${message}`);
}

async function globalSetup() {
  for (const persona of Object.values(PERSONAS)) {
    await provision(persona.email, persona.password);
  }
}

export default globalSetup;
