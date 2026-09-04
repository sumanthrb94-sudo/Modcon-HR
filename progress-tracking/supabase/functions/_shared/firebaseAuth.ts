// Verifying who is calling.
//
// A Firebase ID token is an RS256 JWT signed by Google. Verifying it needs no
// secret — only Google's published keys — which is why identity and
// authorisation are split in two files: this one establishes a uid and nothing
// else. What that uid is allowed to do is a Firestore read, in firestoreUser.ts.
//
// The split is not tidiness. Role and orgId are deliberately not in the token
// (CLAUDE.md, Auth & roles), so a file that could answer both questions would
// be claiming an authority the token does not carry.

const PROJECT_ID = "modconhr-b2789";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface FirebaseKeySource {
  fetchKeys(): Promise<Record<string, JsonWebKey>>;
}

// Built by hand rather than with Uint8Array.from, whose result is typed over
// ArrayBufferLike and therefore not a BufferSource — crypto.subtle wants a
// view onto a real ArrayBuffer.
function base64UrlToBytes(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

/**
 * Throws on anything short of a valid, unexpired token for this project.
 *
 * Every rejection names its reason. Those messages are for the log; the caller
 * gets a bare 401, because telling an unauthenticated stranger which check
 * they failed is telling them what to fix.
 *
 * `keys` and `now` are parameters rather than module state so the whole of
 * this is testable without a network or a clock.
 */
export async function verifyFirebaseToken(
  token: string,
  keys: FirebaseKeySource,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ uid: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeSegment(headerB64) as { alg?: string; kid?: string };
  // Checked before anything else: `alg: none` is the attack where a token
  // carries no signature and asks to be believed anyway.
  if (header.alg !== "RS256") throw new Error(`unexpected algorithm ${header.alg}`);
  if (!header.kid) throw new Error("token names no signing key");

  const published = await keys.fetchKeys();
  const jwk = published[header.kid];
  if (!jwk) throw new Error("token names a signing key Google does not publish");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new Error("signature does not verify");

  const claims = decodeSegment(payloadB64) as {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
  };
  if (claims.iss !== ISSUER) throw new Error(`unexpected issuer ${claims.iss}`);
  if (claims.aud !== PROJECT_ID) throw new Error(`unexpected audience ${claims.aud}`);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("token expired");
  if (!claims.sub) throw new Error("token carries no subject");

  return { uid: claims.sub };
}

/**
 * Google's live keys, cached for as long as Google says they are good for.
 *
 * Google rotates these, so the cache honours the response's max-age rather
 * than a number we picked: caching past rotation rejects every genuine token
 * until the process restarts.
 */
export const googleKeySource: FirebaseKeySource = (() => {
  let cached: Record<string, JsonWebKey> | null = null;
  let expiresAt = 0;

  return {
    async fetchKeys() {
      if (cached && Date.now() < expiresAt) return cached;

      const res = await fetch(JWKS_URL);
      if (!res.ok) throw new Error(`could not fetch Google signing keys (${res.status})`);

      const body = await res.json() as { keys: (JsonWebKey & { kid: string })[] };
      const fresh = Object.fromEntries(body.keys.map((k) => [k.kid, k as JsonWebKey]));
      const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];

      cached = fresh;
      expiresAt = Date.now() + Number(maxAge ?? 3600) * 1000;
      return fresh;
    },
  };
})();
