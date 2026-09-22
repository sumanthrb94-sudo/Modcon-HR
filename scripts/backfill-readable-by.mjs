/**
 * Stamp `readableBy` onto existing `org_records` documents.
 *
 * WHY THIS IS NEEDED, and why it is needed BEFORE the app that depends on it:
 *
 * `firestore.rules` now narrows `expenseClaims` and `payslips` to their
 * subject, whoever is above them in the reporting tree, and the
 * administrators. "Whoever is above them" is answered by `readableBy`, an
 * array denormalised onto each document at write time — rules cannot walk
 * `reportingManagerId`, because the directory it lives in is
 * localStorage-backed and so is a claim the client makes about itself.
 *
 * Documents written before that field existed do not carry it. They stay
 * readable by their own subject (`employeeId` is matched separately) and by
 * administrators, so nobody loses their own records — but a MANAGER cannot
 * read or decide a report's older claim until this has run. That is the whole
 * reason this script exists, and why it belongs in the deploy, not after it.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. Reads the reporting tree from
 * each organisation's own `employees` store, which is where the directory
 * actually lives (see the "four data sources" section of CLAUDE.md) — not
 * from the `employees` Firestore collection, which nothing writes on the
 * ordinary path.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
 *     node scripts/backfill-readable-by.mjs [--apply] [--org=<orgKey>]
 *
 * Against the emulator instead, which is where it should be proven first:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill-readable-by.mjs --apply
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const NARROWED_STORES = new Set(['expenseClaims', 'payslips']);
const apply = process.argv.includes('--apply');
const onlyOrg = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ?? null;

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const PROJECT = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const BASE = EMULATOR
  ? `http://${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function token() {
  if (EMULATOR) return 'owner';
  const key = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  const b64 = (i) => Buffer.from(i).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: key.token_uri, exp: now + 3600, iat: now,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  const jwt = `${head}.${claims}.${signer.sign(key.private_key, 'base64url')}`;
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const S = (f) => (f && 'stringValue' in f ? f.stringValue : undefined);

async function listAll(auth) {
  const out = [];
  let pageToken = '';
  do {
    const res = await fetch(`${BASE}/org_records?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { headers: { Authorization: `Bearer ${auth}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const body = await res.json();
    out.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

/**
 * Everyone above each employee, per organisation. Cycle-guarded, because
 * reporting lines are editable and A→B→A is reachable — the same guard
 * managerChainFor carries in the app.
 */
function chainsFor(directoryByOrg) {
  const chains = new Map();
  for (const [org, managerOf] of directoryByOrg) {
    const perOrg = new Map();
    for (const id of managerOf.keys()) {
      const chain = [];
      const seen = new Set([id]);
      let current = managerOf.get(id) ?? null;
      while (current && !seen.has(current)) {
        chain.push(current);
        seen.add(current);
        current = managerOf.get(current) ?? null;
      }
      perOrg.set(id, chain);
    }
    chains.set(org, perOrg);
  }
  return chains;
}

const auth = await token();
const docs = await listAll(auth);

// The reporting tree, read from each org's own `employees` store.
const directoryByOrg = new Map();
for (const d of docs) {
  const f = d.fields ?? {};
  if (S(f.store) !== 'employees') continue;
  const org = S(f.orgId) ?? 'default';
  let record;
  try { record = JSON.parse(S(f.data) || '{}'); } catch { continue; }
  if (!record?.id) continue;
  if (!directoryByOrg.has(org)) directoryByOrg.set(org, new Map());
  directoryByOrg.get(org).set(record.id, record.reportingManagerId ?? null);
}
const chains = chainsFor(directoryByOrg);

const planned = [];
for (const d of docs) {
  const f = d.fields ?? {};
  const store = S(f.store);
  if (!NARROWED_STORES.has(store)) continue;
  const org = S(f.orgId) ?? 'default';
  if (onlyOrg && org !== onlyOrg) continue;
  const employeeId = S(f.employeeId);
  // No subject means nothing to be above. Left alone rather than guessed at:
  // an administrator still reads it, and inventing a reader is worse than a
  // record only administrators can see.
  if (!employeeId) continue;
  const next = Array.from(new Set([employeeId, ...(chains.get(org)?.get(employeeId) ?? [])]));
  const current = (f.readableBy?.arrayValue?.values ?? []).map((v) => v.stringValue);
  if (current.length === next.length && current.every((v, i) => v === next[i])) continue;
  planned.push({ name: d.name, id: d.name.split('/').pop(), store, org, employeeId, current, next });
}

console.log(`org_records scanned: ${docs.length}`);
console.log(`narrowed-store documents needing readableBy: ${planned.length}`);
for (const p of planned) {
  console.log(`  ${p.store.padEnd(14)} ${p.id.padEnd(50)} ${JSON.stringify(p.current)} -> ${JSON.stringify(p.next)}`);
}

if (!apply) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
}

let updated = 0, failed = 0;
for (const p of planned) {
  const mask = 'updateMask.fieldPaths=readableBy';
  // The id is encoded: an org_records key is `<orgKey>__<store>__<recordId>`
  // and a record id can carry characters a path segment cannot.
  const res = await fetch(`${BASE}/org_records/${encodeURIComponent(p.id)}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: { readableBy: { arrayValue: { values: p.next.map((v) => ({ stringValue: v })) } } },
    }),
  });
  if (res.ok) updated += 1;
  else { failed += 1; console.error(`  FAILED ${p.id}: ${res.status} ${await res.text()}`); }
}
console.log(`\nupdated=${updated} failed=${failed}`);
