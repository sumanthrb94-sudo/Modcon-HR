/**
 * Proves `scripts/backfill-readable-by.mjs` does what it says, against the
 * Firestore emulator.
 *
 * The backfill writes to live data — including the QA organisation — and it
 * is the one piece of this change that runs by hand rather than through CI,
 * so "it looked right" is not good enough. This asserts the five things that
 * matter and would each be silent if wrong:
 *
 *   1. The dry run writes NOTHING (compared by `updateTime`, not by eye).
 *   2. `--apply` stamps the subject first, then their chain.
 *   3. It touches no other field, and no store it was not asked about.
 *   4. A second `--apply` is a no-op — it plans nothing and rewrites nothing,
 *      so re-running after a partial failure is safe.
 *   5. The thing the backfill exists for actually works afterwards: a manager
 *      can read a report's OLD claim, the report still reads their own, and
 *      an unrelated colleague still cannot.
 *
 * Run it:
 *   npx firebase-tools@13 emulators:exec --only firestore --project modconhr-b2789 \
 *     "node scripts/verify-backfill-readable-by.mjs"
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = process.env.GCLOUD_PROJECT ?? 'modconhr-b2789';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const ok = [];
const bad = [];
const check = (label, cond, detail = '') => (cond ? ok : bad).push(`${label}${detail ? ` — ${detail}` : ''}`);

async function put(id, fields) {
  const res = await fetch(`${BASE}/org_records/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`seed ${id}: ${res.status} ${await res.text()}`);
}
const S = (v) => ({ stringValue: v });
async function read(id) {
  const res = await fetch(`${BASE}/org_records/${encodeURIComponent(id)}`, { headers: H });
  return res.ok ? res.json() : null;
}
const arr = (d) => (d?.fields?.readableBy?.arrayValue?.values ?? []).map((v) => v.stringValue);

// --- seed: a manager, a report, and PRE-readableBy records --------------
const ORG = 'default';
const person = (id, managerId) => JSON.stringify({ id, fullName: id, reportingManagerId: managerId });

await put(`${ORG}__employees__emp-mgr`, {
  orgId: S(ORG), store: S('employees'), recordId: S('emp-mgr'), data: S(person('emp-mgr', null)),
});
await put(`${ORG}__employees__emp-rep`, {
  orgId: S(ORG), store: S('employees'), recordId: S('emp-rep'), data: S(person('emp-rep', 'emp-mgr')),
});
// An OLD claim: employeeId lifted, no readableBy — exactly what predates this.
await put(`${ORG}__expenseClaims__old-claim`, {
  orgId: S(ORG), store: S('expenseClaims'), recordId: S('old-claim'),
  employeeId: S('emp-rep'), status: S('Submitted'),
  data: S(JSON.stringify({ id: 'old-claim', employeeId: 'emp-rep', amount: 500, status: 'Submitted' })),
});
await put(`${ORG}__payslips__old-slip`, {
  orgId: S(ORG), store: S('payslips'), recordId: S('old-slip'),
  employeeId: S('emp-mgr'),
  data: S(JSON.stringify({ id: 'old-slip', employeeId: 'emp-mgr', net: 1000 })),
});
// Regularizations: one that predates readableBy, and one whose stored list
// knows a reader the directory does not (emp-former) — the additive run must
// keep them.
await put(`${ORG}__regularizationOverrides__reg-old`, {
  orgId: S(ORG), store: S('regularizationOverrides'), recordId: S('reg-old'),
  employeeId: S('emp-rep'), status: S('Pending'),
  data: S(JSON.stringify({ id: 'reg-old', employeeId: 'emp-rep', date: '2026-09-01', requestedStatus: 'Present', status: 'Pending' })),
});
await put(`${ORG}__regularizationOverrides__reg-kept`, {
  orgId: S(ORG), store: S('regularizationOverrides'), recordId: S('reg-kept'),
  employeeId: S('emp-rep'), status: S('Pending'),
  readableBy: { arrayValue: { values: [S('emp-rep'), S('emp-former')] } },
  data: S(JSON.stringify({ id: 'reg-kept', employeeId: 'emp-rep', date: '2026-09-02', requestedStatus: 'Present', status: 'Pending' })),
});
// A store the backfill must NOT touch.
await put(`${ORG}__tickets__old-ticket`, {
  orgId: S(ORG), store: S('tickets'), recordId: S('old-ticket'),
  data: S(JSON.stringify({ id: 'old-ticket', subject: 'untouched' })),
});

const before = {
  claim: await read(`${ORG}__expenseClaims__old-claim`),
  slip: await read(`${ORG}__payslips__old-slip`),
  ticket: await read(`${ORG}__tickets__old-ticket`),
  regOld: await read(`${ORG}__regularizationOverrides__reg-old`),
  regKept: await read(`${ORG}__regularizationOverrides__reg-kept`),
};

// --- 1. dry run writes nothing -----------------------------------------
const dry = execFileSync('node', ['scripts/backfill-readable-by.mjs'], {
  encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST },
});
check('dry run plans the two narrowed records', /needing readableBy: 2/.test(dry), dry.match(/needing readableBy: \d+/)?.[0]);
check('dry run names the manager in the plan', /\["emp-rep","emp-mgr"\]/.test(dry));
check('dry run says it wrote nothing', /DRY RUN/.test(dry));
const afterDry = await read(`${ORG}__expenseClaims__old-claim`);
check('dry run left the document untouched', afterDry.updateTime === before.claim.updateTime);

// --- 2. apply ----------------------------------------------------------
execFileSync('node', ['scripts/backfill-readable-by.mjs', '--apply'], {
  encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST },
});
const claim1 = await read(`${ORG}__expenseClaims__old-claim`);
const slip1 = await read(`${ORG}__payslips__old-slip`);
const ticket1 = await read(`${ORG}__tickets__old-ticket`);

check('report claim: readableBy is subject then manager',
  JSON.stringify(arr(claim1)) === JSON.stringify(['emp-rep', 'emp-mgr']), JSON.stringify(arr(claim1)));
check('manager payslip: readableBy is just themselves',
  JSON.stringify(arr(slip1)) === JSON.stringify(['emp-mgr']), JSON.stringify(arr(slip1)));
check('a store with no decision rule was not touched',
  ticket1.updateTime === before.ticket.updateTime && !ticket1.fields.readableBy);

// no other field changed
for (const [name, was, now] of [['claim', before.claim, claim1], ['slip', before.slip, slip1]]) {
  const strip = (d) => { const f = { ...d.fields }; delete f.readableBy; return JSON.stringify(f); };
  check(`${name}: no field but readableBy changed`, strip(was) === strip(now));
}

// --- 3. idempotent ------------------------------------------------------
const second = execFileSync('node', ['scripts/backfill-readable-by.mjs', '--apply'], {
  encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST },
});
check('second --apply plans nothing', /needing readableBy: 0/.test(second), second.match(/needing readableBy: \d+/)?.[0]);
const claim2 = await read(`${ORG}__expenseClaims__old-claim`);
check('second --apply did not rewrite the document', claim2.updateTime === claim1.updateTime);

// --- 3b. a default run never touches regularizations ------------------
check('default runs left both regularizations untouched',
  (await read(`${ORG}__regularizationOverrides__reg-old`)).updateTime === before.regOld.updateTime &&
  (await read(`${ORG}__regularizationOverrides__reg-kept`)).updateTime === before.regKept.updateTime);

// --- 3c. regularizations, named and additive -----------------------------
const REG_ARGS = ['scripts/backfill-readable-by.mjs', '--store=regularizationOverrides', '--additive'];
const regDry = execFileSync('node', REG_ARGS, { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST } });
check('regularization dry run plans both', /needing readableBy: 2/.test(regDry), regDry.match(/needing readableBy: \d+/)?.[0]);
check('regularization dry run wrote nothing',
  (await read(`${ORG}__regularizationOverrides__reg-old`)).updateTime === before.regOld.updateTime);
execFileSync('node', [...REG_ARGS, '--apply'], { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST } });
const regOld1 = await read(`${ORG}__regularizationOverrides__reg-old`);
const regKept1 = await read(`${ORG}__regularizationOverrides__reg-kept`);
check('old regularization: subject then manager',
  JSON.stringify(arr(regOld1)) === JSON.stringify(['emp-rep', 'emp-mgr']), JSON.stringify(arr(regOld1)));
check('additive: a reader already stored is kept',
  JSON.stringify(arr(regKept1)) === JSON.stringify(['emp-rep', 'emp-former', 'emp-mgr']), JSON.stringify(arr(regKept1)));
{
  const strip = (d) => { const f = { ...d.fields }; delete f.readableBy; return JSON.stringify(f); };
  check('regularization: no field but readableBy changed', strip(before.regOld) === strip(regOld1));
}
check('the regularization run did not touch the claim',
  (await read(`${ORG}__expenseClaims__old-claim`)).updateTime === claim2.updateTime);
const regSecond = execFileSync('node', [...REG_ARGS, '--apply'], { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST } });
check('second regularization --apply plans nothing', /needing readableBy: 0/.test(regSecond), regSecond.match(/needing readableBy: \d+/)?.[0]);

// --- 4. the manager can now read the report's old claim -----------------
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { host: HOST.split(':')[0], port: Number(HOST.split(':')[1]), rules: readFileSync('firestore.rules', 'utf8') },
});
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [uid, employeeId, role] of [['u-mgr', 'emp-mgr', 'manager'], ['u-rep', 'emp-rep', 'employee'], ['u-other', 'emp-other', 'employee'], ['u-mgr2', 'emp-mgr2', 'manager']]) {
    await setDoc(doc(db, 'users', uid), { uid, email: `${uid}@x.test`, role, orgId: ORG });
    await setDoc(doc(db, 'employee_links', uid), { employeeId, orgId: ORG });
  }
});
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.test` }).firestore();
try {
  await assertSucceeds(getDoc(doc(as('u-mgr'), 'org_records', `${ORG}__expenseClaims__old-claim`)));
  check('manager CAN read the report’s backfilled claim', true);
} catch (e) { check('manager CAN read the report’s backfilled claim', false, String(e).slice(0, 120)); }
try {
  await assertSucceeds(getDoc(doc(as('u-rep'), 'org_records', `${ORG}__expenseClaims__old-claim`)));
  check('the report can still read their own', true);
} catch (e) { check('the report can still read their own', false, String(e).slice(0, 120)); }
try {
  await assertFails(getDoc(doc(as('u-other'), 'org_records', `${ORG}__expenseClaims__old-claim`)));
  check('an unrelated colleague still cannot', true);
} catch (e) { check('an unrelated colleague still cannot', false, String(e).slice(0, 120)); }

// --- 5. regularizations: the manager above decides, one outside cannot ----
const regAt = (uid) => doc(as(uid), 'org_records', `${ORG}__regularizationOverrides__reg-old`);
const regDecision = (status, readableBy) => ({
  orgId: ORG, store: 'regularizationOverrides', recordId: 'reg-old', employeeId: 'emp-rep', status, readableBy,
  data: JSON.stringify({ id: 'reg-old', employeeId: 'emp-rep', date: '2026-09-01', requestedStatus: 'Present', status }),
});
for (const [label, fn] of [
  ['manager CAN read the report’s backfilled regularization', () => assertSucceeds(getDoc(regAt('u-mgr')))],
  ['a manager outside the line CANNOT read it', () => assertFails(getDoc(regAt('u-mgr2')))],
  ['a manager outside the line CANNOT approve it', () => assertFails(setDoc(regAt('u-mgr2'), regDecision('Approved', ['emp-rep', 'emp-mgr', 'emp-mgr2'])))],
  ['the manager above CAN approve it', () => assertSucceeds(setDoc(regAt('u-mgr'), regDecision('Approved', ['emp-rep', 'emp-mgr'])))],
]) {
  try { await fn(); check(label, true); } catch (e) { check(label, false, String(e).slice(0, 120)); }
}
await env.cleanup();

console.log('\n=== PASS ===');
ok.forEach((l) => console.log('  ok   ' + l));
if (bad.length) { console.log('=== FAIL ==='); bad.forEach((l) => console.log('  FAIL ' + l)); }
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
