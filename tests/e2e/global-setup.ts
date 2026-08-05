import { FIREBASE_API_KEY, HR_PERSONA, PERSONAS, SUPER_ADMIN } from './config';
import { EMULATOR_HOST, IDENTITY_BASE, seedPersonaProfiles } from './firestore';

/**
 * Ensure every dedicated E2E test account exists in Firebase Auth before the
 * suite runs. Idempotent: accounts that already exist are left as-is.
 */
async function provision(email: string, password: string) {
  const url = `${IDENTITY_BASE}/accounts:signUp?key=${FIREBASE_API_KEY}`;
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
  for (const persona of [...Object.values(PERSONAS), HR_PERSONA, SUPER_ADMIN]) {
    await provision(persona.email, persona.password);
  }
  // An emulator starts with no users/{uid} documents, and the rules refuse to
  // let an account create its own privileged one. See seedPersonaProfiles.
  if (EMULATOR_HOST) {
    console.log(`[e2e] Firestore emulator at ${EMULATOR_HOST} — seeding persona profiles`);
    await seedPersonaProfiles();
  }
}

export default globalSetup;
