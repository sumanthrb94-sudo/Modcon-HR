import { FIREBASE_API_KEY, HR_PERSONA, PERSONAS, ROLE_CHURN_PERSONA, SUPER_ADMIN } from './config';

/**
 * Firestore REST access for the specs, against whichever project the run is
 * pointed at.
 *
 * The suite normally talks to the live `modconhr-b2789` project, which has a daily
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
  ? `http://${EMULATOR_HOST}/v1/projects/modconhr-b2789/databases/(default)/documents`
  : 'https://firestore.googleapis.com/v1/projects/modconhr-b2789/databases/(default)/documents';

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

/**
 * Delete every record one store holds for the default organisation.
 *
 * Specs used to reset a collection by clearing `localStorage` and nothing else,
 * which worked while that was the only copy. Now that records live in
 * `org_records` (see src/data/persistence.ts) the subscription hydrates the
 * cache straight back from the server, and a spec that cleared only the browser
 * is testing against whatever an earlier test in the run left behind.
 *
 * Uses the emulator's owner bypass, which is right here: this is setup, not a
 * thing the app does, and no page is expected to notice it — the specs that use
 * it reload afterwards.
 */
export async function clearOrgRecords(
  store: string,
  options: { employeeId?: string; orgKey?: string } = {},
): Promise<void> {
  const { employeeId, orgKey = 'default' } = options;
  const token = await adminToken();
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'org_records' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'orgId' }, op: 'EQUAL', value: { stringValue: orgKey } } },
              { fieldFilter: { field: { fieldPath: 'store' }, op: 'EQUAL', value: { stringValue: store } } },
              // Scoped to one person when the caller names one, and that is not
              // an optimisation. Several specs reset attendance, they run in
              // parallel across workers, and they now share one server — an
              // org-wide delete wipes the records another spec wrote a moment
              // ago. `employeeId` is lifted to a top-level field by
              // src/data/persistence.ts, which is what makes this filterable.
              ...(employeeId
                ? [{ fieldFilter: { field: { fieldPath: 'employeeId' }, op: 'EQUAL', value: { stringValue: employeeId } } }]
                : []),
            ],
          },
        },
      },
    }),
  });
  if (!res.ok) return;

  const rows = (await res.json()) as Array<{ document?: { name?: string } }>;
  await Promise.all(
    rows
      .map((row) => row.document?.name)
      .filter((name): name is string => Boolean(name))
      // `name` is the full resource path; the REST base already ends at
      // `/documents`, so only the part after it is appended.
      .map((name) => {
        const relative = name.slice(name.indexOf('/documents/') + '/documents/'.length);
        return fetch(`${FIRESTORE_BASE}/${relative}`, { method: 'DELETE', headers });
      }),
  );
}

/**
 * Read one `org_records` document back from the server.
 *
 * The counterpart to `clearOrgRecords`, and it exists for the same reason:
 * writes through `src/data/persistence.ts` are **optimistic**. `save()` updates
 * the cache, fires the change event and returns; the batch commit happens
 * afterwards and is never awaited, because no page should wait on the network
 * to show what the user just did.
 *
 * The consequence for a spec is that a reload issued immediately after a click
 * races that commit — and a reload is not neutral, because a fresh page is a
 * fresh Firestore SDK with an empty mutation queue. The un-acked write is gone,
 * the subscription hydrates the cache from the server's older copy, and the
 * decision the test just made silently reverts. That is what this is for:
 * `waitForOrgRecord` before a reload turns the race into a wait.
 *
 * Returns the record as the app stored it, or null when the document is absent.
 */
export async function readOrgRecord<T = Record<string, unknown>>(
  store: string,
  recordId: string,
  orgKey = 'default',
): Promise<T | null> {
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}/org_records/${orgKey}__${store}__${recordId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    fields?: { data?: { stringValue?: string }; deleted?: { booleanValue?: boolean } };
  };
  if (body.fields?.deleted?.booleanValue) return null;
  const json = body.fields?.data?.stringValue;
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Wait until the server's copy of one record satisfies `predicate`.
 *
 * Throws on timeout rather than returning false: a spec that goes on to reload
 * anyway would fail later, somewhere unrelated, with the revert described above
 * as its symptom.
 */
export async function waitForOrgRecord<T = Record<string, unknown>>(
  store: string,
  recordId: string,
  predicate: (record: T | null) => boolean,
  options: { orgKey?: string; timeoutMs?: number } = {},
): Promise<T | null> {
  const { orgKey = 'default', timeoutMs = 15_000 } = options;
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await readOrgRecord<T>(store, recordId, orgKey);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `org_records/${orgKey}__${store}__${recordId} never satisfied the predicate ` +
      `within ${timeoutMs}ms; last value was ${JSON.stringify(last)}`,
  );
}

/**
 * Every record this organisation has stored for one store, as the app wrote it.
 *
 * The list form of `readOrgRecord`, for the common case where a spec knows what
 * it did but not the id the app derived for it — a regularization is keyed on
 * an employee id the page never shows. Tombstoned records are omitted; they are
 * deletions, and no assertion wants them.
 */
export async function listOrgRecords<T = Record<string, unknown>>(
  store: string,
  options: { employeeId?: string; orgKey?: string } = {},
): Promise<T[]> {
  const { employeeId, orgKey = 'default' } = options;
  const token = await adminToken();
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'org_records' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'orgId' }, op: 'EQUAL', value: { stringValue: orgKey } } },
              { fieldFilter: { field: { fieldPath: 'store' }, op: 'EQUAL', value: { stringValue: store } } },
              ...(employeeId
                ? [{ fieldFilter: { field: { fieldPath: 'employeeId' }, op: 'EQUAL', value: { stringValue: employeeId } } }]
                : []),
            ],
          },
        },
      },
    }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    document?: { fields?: { data?: { stringValue?: string }; deleted?: { booleanValue?: boolean } } };
  }>;
  return rows.flatMap((row) => {
    const fields = row.document?.fields;
    if (!fields || fields.deleted?.booleanValue) return [];
    const json = fields.data?.stringValue;
    if (!json) return [];
    try {
      return [JSON.parse(json) as T];
    } catch {
      return [];
    }
  });
}

/**
 * Wait until this store has stopped changing on the server.
 *
 * The generic form of the race `waitForOrgRecord` names: a write through
 * `src/data/persistence.ts` is optimistic, so a click returns before its commit
 * lands. Two things in a spec are then unsafe until it has:
 *
 *   - **a reload**, because a fresh page is a fresh Firestore SDK with an empty
 *     mutation queue — the un-acked write is gone, and the subscription
 *     hydrates the cache from the server's older copy, reverting what the test
 *     just did;
 *   - **a reset**, because a delete issued before the commit is overtaken by
 *     it, and the scenario starts against the record it thought it removed.
 *
 * Use this where the spec does not know the id it is waiting on (a reset clears
 * whatever is there); use `waitForOrgRecord` where it can state the value it
 * expects, which is the stronger assertion.
 *
 * "Quiet" is two identical reads `settleMs` apart rather than one, because a
 * single read a moment after a click sees the state *before* it just as
 * convincingly as the state after.
 */
export async function waitForOrgRecordsQuiet(
  store: string,
  options: { employeeId?: string; orgKey?: string; settleMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const { employeeId, orgKey = 'default', settleMs = 400, timeoutMs = 15_000 } = options;
  const deadline = Date.now() + timeoutMs;
  let previous: string | null = null;
  while (Date.now() < deadline) {
    const current = JSON.stringify(await listOrgRecords(store, { employeeId, orgKey }));
    if (previous !== null && current === previous) return;
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
  // Falling through is deliberate: a store that genuinely never settles is a
  // failure the assertions after this will state far better than a throw here.
}
