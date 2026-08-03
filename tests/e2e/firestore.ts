import { FIREBASE_API_KEY, PERSONAS } from './config';

/**
 * Firestore REST access for the specs, against whichever project the run is
 * pointed at.
 *
 * The suite normally talks to the live `modcon-hr` project, which has a daily
 * quota: exhaust it and every publish comes back `429 RESOURCE_EXHAUSTED`,
 * which reads exactly like an app that has stopped saving. Setting
 * `E2E_FIRESTORE_EMULATOR=host:port` points both the app bundle (see
 * `VITE_FIRESTORE_EMULATOR_HOST` in src/lib/firebase.ts) and these helpers at a
 * local emulator instead, so a run costs nothing and cannot be rate-limited.
 *
 * The emulator still evaluates `firestore.rules`, so authorization is exercised
 * either way. Two things differ, both deliberate:
 *   - `Bearer owner` bypasses rules, which is how the seeding below writes the
 *     `users/{uid}` documents that the live project already has.
 *   - Auth is not emulated. Sign-in still goes to the live project, so the uids
 *     are the real ones and the personas are the same accounts.
 */
export const EMULATOR_HOST = process.env.E2E_FIRESTORE_EMULATOR ?? '';

export const FIRESTORE_BASE = EMULATOR_HOST
  ? `http://${EMULATOR_HOST}/v1/projects/modcon-hr/databases/(default)/documents`
  : 'https://firestore.googleapis.com/v1/projects/modcon-hr/databases/(default)/documents';

/** Sign in and return the account's ID token and uid, or nulls if refused. */
export async function signInPersona(
  email: string,
  password: string,
): Promise<{ idToken: string | null; uid: string | null }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = (await res.json()) as { idToken?: string; localId?: string };
  return { idToken: data.idToken ?? null, uid: data.localId ?? null };
}

/**
 * A bearer token with administrator reach over the documents under test.
 *
 * Against the emulator that is the literal string `owner`, which the emulator
 * accepts as a rules bypass. Against the live project it is the admin persona's
 * own ID token, fetched once — the same account the specs drive the UI with, so
 * the helpers cannot do anything the tests could not.
 */
let cachedAdminToken: string | null | undefined;
export async function adminToken(): Promise<string | null> {
  if (EMULATOR_HOST) return 'owner';
  if (cachedAdminToken !== undefined) return cachedAdminToken;
  const { idToken } = await signInPersona(PERSONAS.admin.email, PERSONAS.admin.password);
  cachedAdminToken = idToken;
  return cachedAdminToken;
}

/**
 * Give the personas the `users/{uid}` documents the rules read.
 *
 * Only needed against the emulator, which starts empty. The live project
 * already holds these, and they cannot be created by the app signing in:
 * `selfCreateRoleIsValid` in firestore.rules deliberately refuses an account
 * that tries to grant itself a role it was not assigned, which is the whole
 * point of that rule. So they are written here with the emulator's owner
 * bypass, exactly as an administrator would have created them.
 *
 * `orgId: 'default'` matters as much as the role — without it `myOrgKey()`
 * resolves to the unassigned sentinel and every org-scoped write is refused.
 */
export async function seedPersonaProfiles(): Promise<void> {
  if (!EMULATOR_HOST) return;

  for (const persona of Object.values(PERSONAS)) {
    const { uid } = await signInPersona(persona.email, persona.password);
    if (!uid) {
      throw new Error(`[e2e] could not resolve a uid for ${persona.email} — cannot seed its profile`);
    }
    const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          email: { stringValue: persona.email },
          role: { stringValue: persona.role },
          orgId: { stringValue: 'default' },
          superAdmin: { booleanValue: false },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`[e2e] seeding users/${uid} failed: ${res.status} ${await res.text()}`);
    }
    console.log(`[e2e] emulator: seeded users/${uid} as ${persona.role} for ${persona.email}`);
  }
}
