// Unit tests for Firebase ID token verification.
//
// Every token here is signed with a key pair the test generates, so the suite
// needs no network, no Firebase project and no credential — and can therefore
// assert the rejections, which is the half that matters.
//
// Run: node --experimental-strip-types --test test/firebase-auth.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyFirebaseToken, type FirebaseKeySource } from "../supabase/functions/_shared/firebaseAuth.ts";

const PROJECT = "modconhr-b2789";

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlBytes = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Sign a token with a throwaway key pair so the test controls every claim. */
async function makeToken(
  claims: Record<string, unknown>,
  kid = "test-key",
): Promise<{ token: string; source: FirebaseKeySource }> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;

  const header = b64url(JSON.stringify({ alg: "RS256", kid }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

  return {
    token: `${header}.${body}.${b64urlBytes(sig)}`,
    source: { fetchKeys: async () => ({ [kid]: jwk as JsonWebKey }) },
  };
}

const validClaims = (over: Record<string, unknown> = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "uid-123",
  exp: 2000,
  iat: 1000,
  ...over,
});

test("accepts a well-formed token and returns the uid", async () => {
  const { token, source } = await makeToken(validClaims());
  assert.deepEqual(await verifyFirebaseToken(token, source, 1500), { uid: "uid-123" });
});

test("rejects an expired token", async () => {
  const { token, source } = await makeToken(validClaims());
  await assert.rejects(() => verifyFirebaseToken(token, source, 3000), /expired/i);
});

test("rejects a token for another Firebase project", async () => {
  const { token, source } = await makeToken(validClaims({ aud: "someone-else" }));
  await assert.rejects(() => verifyFirebaseToken(token, source, 1500), /audience/i);
});

test("rejects a token with the wrong issuer", async () => {
  const { token, source } = await makeToken(validClaims({ iss: "https://evil.example.com" }));
  await assert.rejects(() => verifyFirebaseToken(token, source, 1500), /issuer/i);
});

test("rejects a token whose kid Google does not publish", async () => {
  const { token } = await makeToken(validClaims());
  const empty: FirebaseKeySource = { fetchKeys: async () => ({}) };
  await assert.rejects(() => verifyFirebaseToken(token, empty, 1500), /signing key/i);
});

test("rejects a tampered payload", async () => {
  const { token, source } = await makeToken(validClaims());
  const [header, , signature] = token.split(".");
  const forged = b64url(JSON.stringify(validClaims({ sub: "somebody-else" })));
  await assert.rejects(
    () => verifyFirebaseToken(`${header}.${forged}.${signature}`, source, 1500),
    /signature/i,
  );
});

test("rejects a token carrying no subject", async () => {
  const { token, source } = await makeToken(validClaims({ sub: "" }));
  await assert.rejects(() => verifyFirebaseToken(token, source, 1500), /subject/i);
});

test("rejects an unsigned token offering alg none", async () => {
  const header = b64url(JSON.stringify({ alg: "none", kid: "test-key" }));
  const body = b64url(JSON.stringify(validClaims()));
  const source: FirebaseKeySource = { fetchKeys: async () => ({}) };
  await assert.rejects(() => verifyFirebaseToken(`${header}.${body}.`, source, 1500), /algorithm/i);
});

test("rejects something that is not a JWT at all", async () => {
  const source: FirebaseKeySource = { fetchKeys: async () => ({}) };
  await assert.rejects(() => verifyFirebaseToken("not-a-token", source, 1500), /malformed/i);
});
