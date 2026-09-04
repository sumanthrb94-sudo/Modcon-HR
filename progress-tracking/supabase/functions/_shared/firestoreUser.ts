// What the caller is allowed to do.
//
// The ID token proves a uid and nothing more. Role and orgId live in Firestore
// users/{uid} — deliberately, because src/data/employees.ts is localStorage
// backed and therefore client-controlled, so a self-asserted designation must
// never confer access (CLAUDE.md, Auth & roles). This file is the only place
// that answers "which organisation, and are they its administrator".
//
// It needs a Firebase service-account credential, which is the most valuable
// secret in this deployment. It lives in `supabase secrets` as
// FIREBASE_SERVICE_ACCOUNT and must never be committed or shipped to a client.

const PROJECT_ID = "modconhr-b2789";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

export interface Caller {
  orgKey: string;
  isHrAdmin: boolean;
}

export interface FirestoreDocument {
  fields?: Record<string, { stringValue?: string }>;
}

/**
 * Pure, so every branch is testable without a credential.
 *
 * Returns null for an account with no organisation. That is not the default
 * tenant and must never become it: an account with no orgId is *unassigned*,
 * and resolving it to the incumbent organisation is the bug that let
 * self-registration read another company's data.
 *
 * `admin` counts alongside `hr` to match isOrgAdmin() in firestore.rules —
 * an organisation's own administrator holds `hr`, and the platform `admin`
 * role is a different thing a tenant may not have at all. `manager` does not
 * count: elsewhere in this app isManager includes admin, but approving leave
 * and configuring the organisation are different authorities.
 */
export function parseUserDocument(doc: FirestoreDocument | null): Caller | null {
  const orgKey = doc?.fields?.orgId?.stringValue?.trim();
  if (!orgKey) return null;

  const role = doc?.fields?.role?.stringValue ?? "";
  return { orgKey, isHrAdmin: role === "hr" || role === "admin" };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Exchange the service account for an access token, cached until it expires.
 *
 * Throws rather than returning null on every failure path, so the caller can
 * tell "this account has no organisation" (an answer) from "we could not find
 * out" (an outage) and refuse with 503 instead of 403.
 */
let accessToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(fetchImpl: typeof fetch): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiresAt) return accessToken.value;

  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");

  let credential: { client_email: string; private_key: string };
  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }
  if (!credential.client_email || !credential.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key");
  }

  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: credential.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(credential.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${claims}`),
  );

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!res.ok) throw new Error(`service account rejected (${res.status})`);

  const body = await res.json() as { access_token: string; expires_in: number };
  // A minute of headroom, so a token does not expire mid-request.
  accessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return accessToken.value;
}

export async function resolveCaller(
  uid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Caller | null> {
  const token = await getAccessToken(fetchImpl);
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;

  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });

  // A user document that does not exist is an answer, not a failure: this
  // account belongs to no organisation.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read failed (${res.status})`);

  return parseUserDocument(await res.json() as FirestoreDocument);
}
