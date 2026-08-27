import { FIREBASE_API_KEY, HR_PERSONA, PERSONAS, ROLE_CHURN_PERSONA, SUPER_ADMIN } from './config';
import { AUTH_EMULATOR_HOST, EMULATOR_HOST, IDENTITY_BASE, seedPersonaProfiles } from './firestore';

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
  // Provisioning creates accounts. Against the Auth emulator that costs
  // nothing and vanishes with the run; against the live project it is five real
  // accounts on the production Firebase project, created by a test.
  //
  // The two emulators are configured independently — `E2E_FIRESTORE_EMULATOR`
  // and `E2E_AUTH_EMULATOR` — so it is possible, and documented, to emulate
  // Firestore alone. That path used to come here and sign up against live Auth
  // without saying so. It now needs `E2E_LIVE_AUTH=true`, typed on purpose,
  // which is the same shape as the `E2E_LIVE_FIRESTORE` escape hatch.
  if (!AUTH_EMULATOR_HOST && process.env.E2E_LIVE_AUTH !== 'true') {
    throw new Error(
      '[e2e] refusing to provision test accounts against live Firebase Auth. ' +
        'Run `npm run test:e2e`, which starts the Auth emulator and points the ' +
        'suite at it, or set E2E_LIVE_AUTH=true if creating real accounts on the ' +
        'production project is genuinely what you want.',
    );
  }

  for (const persona of [...Object.values(PERSONAS), HR_PERSONA, SUPER_ADMIN, ROLE_CHURN_PERSONA]) {
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
