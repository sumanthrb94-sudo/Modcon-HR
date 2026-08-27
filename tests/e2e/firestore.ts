import { FIREBASE_API_KEY, HR_PERSONA, PERSONAS, ROLE_CHURN_PERSONA, SUPER_ADMIN } from './config';

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
 * either way. What differs is deliberate: `Bearer owner` bypasses rules, which
 * is how the seeding below writes the `users/{uid}` documents the live project
 * already has.
 *
 * Auth is emulated on the same terms (`E2E_AUTH_EMULATOR`), so a default run
 * reaches no live Google service: the accounts, uids and tokens all belong to
 * the emulator and vanish with it. `E2E_LIVE_FIRESTORE=true` turns both off,
 * which is the only way to check the deployed ruleset — and the only way to
 * touch the organisation's real data.
 */
export const EMULATOR_HOST = process.env.E2E_FIRESTORE_EMULATOR ?? '';
export const AUTH_EMULATOR_HOST = process.env.E2E_AUTH_EMULATOR ?? '';

export const FIRESTORE_BASE = EMULATOR_HOST
  ? `http://${EMULATOR_HOST}/v1/projects/modcon-hr/databases/(default)/documents`
  : 'https://firestore.googleapis.com/v1/projects/modcon-hr/databases/(default)/documents';

/**
 * Identity Toolkit, live or emulated.
 *
 * The Auth emulator serves the real REST surface under a prefixed path, so the
 * same calls work against both and only the base changes. The API key is still
 * required in the query string and still ignored by the emulator.
 */
export const IDENTITY_BASE = AUTH_EMULATOR_HOST
  ? `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
  : 'https://identitytoolkit.googleapis.com/v1';

/** Sign in and return the account's ID token and uid, or nulls if refused. */
export async function signInPersona(
  email: string,
  password: string,
): Promise<{ idToken: string | null; uid: string | null }> {
  const res = await fetch(
    `${IDENTITY_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
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
/**
 * Which employee record an account is pointed at, read straight from Firestore.
 *
 * `employee_links/{uid}` is what `isSelf()` in firestore.rules resolves against,
 * and nothing else can stand in for it: the employee directory the app renders
 * from is localStorage, so the client's claim about which employee it is carries
 * no weight on the server. That is the whole point of the collection — see
 * src/data/employeeLinks.ts.
 *
 * Read rather than written, deliberately. Writing it here would let a spec
 * arrange the precondition the app is supposed to establish, and the day the
 * app stopped establishing it every test would still pass.
 */
export async function employeeLinkFor(uid: string): Promise<{ employeeId: string } | null> {
  const token = await adminToken();
  if (!token) return null;
  const res = await fetch(`${FIRESTORE_BASE}/employee_links/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) return null;
  const employeeId = (await res.json()).fields?.employeeId?.stringValue;
  return typeof employeeId === 'string' ? { employeeId } : null;
}

/**
 * Set one account's stored role directly, for setup and cleanup.
 *
 * `updateMask` is what makes this a role change rather than a profile
 * replacement: a bare PATCH would drop `orgId`, and an account with no orgId
 * resolves to a sentinel matching nothing, so anything asserted afterwards
 * would be measuring a tenant lockout instead of a role.
 *
 * **Not usable to change a role that an open page is expected to notice.** A
 * write made through the emulator's `Bearer owner` bypass does not reach the
 * Watch streams the app's `onSnapshot` listeners are on: the listener stays on
 * its cached snapshot (`metadata.fromCache` never clears) and no error is
 * raised, so a spec built this way fails no matter what the client does, and
 * looks exactly like a broken listener. Drive the change through the UI that
 * makes it instead — see role-change-propagation.spec.ts, which uses the Admin
 * dashboard's own control and calls this only to reset the account either side
 * of the run, before anybody has it open.
 */
export async function setStoredRole(uid: string, role: string): Promise<void> {
  const res = await fetch(`${FIRESTORE_BASE}/users/${uid}?updateMask.fieldPaths=role`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { role: { stringValue: role } } }),
  });
  if (!res.ok) {
    throw new Error(`[e2e] setting users/${uid}.role=${role} failed: ${res.status} ${await res.text()}`);
  }
}

export async function seedPersonaProfiles(): Promise<void> {
  if (!EMULATOR_HOST) return;

  for (const persona of [...Object.values(PERSONAS), HR_PERSONA, SUPER_ADMIN, ROLE_CHURN_PERSONA]) {
    const { uid } = await signInPersona(persona.email, persona.password);
    if (!uid) {
      throw new Error(`[e2e] could not resolve a uid for ${persona.email} — cannot seed its profile`);
    }
    // The super admin deliberately carries **no** orgId: it administers every
    // organisation rather than belonging to one, and resolveOrgKeyForProfile
    // reads whichever org it last switched to instead. Giving it one would pin
    // it to the default org and the org-switch under test would do nothing.
    const superAdmin = 'superAdmin' in persona && persona.superAdmin === true;
    const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          email: { stringValue: persona.email },
          role: { stringValue: persona.role },
          ...(superAdmin ? {} : { orgId: { stringValue: 'default' } }),
          superAdmin: { booleanValue: superAdmin },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`[e2e] seeding users/${uid} failed: ${res.status} ${await res.text()}`);
    }
    console.log(
      `[e2e] emulator: seeded users/${uid} as ${superAdmin ? 'super admin' : persona.role} for ${persona.email}`,
    );
  }
}
