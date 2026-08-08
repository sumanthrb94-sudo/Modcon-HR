#!/usr/bin/env node
/**
 * Dry run: which organisations are holding ModCon Builders' demo leave policy?
 *
 * Reports only. There is no Firebase client in this file and no write path of
 * any kind — it reads a dump of `org_settings` documents you hand it, or a
 * simulated set, and prints what a sweep would find. Getting that dump is a
 * separate, deliberate step; see --help.
 *
 * The rule is the one the app uses (`inheritedDemoPolicies` in
 * src/data/leavePolicies.ts): a type is inherited when it still carries a
 * seeded demo **id** under the demo's own name. `lp1`..`lp7` are literals in
 * the seed; a type added in Settings is `lp<timestamp>` and an uploaded one is
 * `lp-<slug>`, so an organisation cannot mint one of these by accident. The
 * figures are deliberately not compared: the likeliest shape of this is a list
 * where somebody flipped one carry-forward switch, which is what saved it.
 *
 * What this cannot tell you: whether leave has actually been taken under a
 * type. Leave requests are a localStorage overlay with no server behind them
 * (see CLAUDE.md), so that question is only answerable in the organisation's
 * own browser — which is why the remediation lives in Settings and this is a
 * survey rather than a migration.
 */

// The seeded identities, frozen: id -> type. Mirrors DEMO_LEAVE_POLICIES in
// src/data/leavePolicies.ts. These seven are historical literals; a change
// there mints new-style ids rather than editing these.
const DEMO_IDENTITIES = new Map([
  ['lp1', 'Casual Leave'],
  ['lp2', 'Sick Leave'],
  ['lp3', 'Earned Leave'],
  ['lp4', 'Unpaid Leave'],
  ['lp5', 'Maternity Leave'],
  ['lp6', 'Paternity Leave'],
  ['lp7', 'Comp Off'],
]);

/** The demo organisation's own list is not inherited — it is theirs. */
const DEMO_ORG_KEY = 'default';

const HELP = `
Usage:
  node scripts/inherited-leave-policies.mjs --simulate
  node scripts/inherited-leave-policies.mjs --input <dump.json>

  --simulate        Run against a fabricated set of organisations. No real data
                    is read and none exists in this mode.
  --input <file>    A JSON array of org_settings documents:
                      [{ "id": "<orgKey>__leavePolicies", "value": [ ...policies ] }]
                    Export it however you normally read Firestore; this script
                    deliberately has no credentials and no network access.

Reports only. Nothing is written in either mode.
`;

/** Split one organisation's stored list into what it chose and what it inherited. */
function surveyOrg(orgKey, policies) {
  const inherited = [];
  const own = [];
  for (const policy of policies) {
    if (orgKey !== DEMO_ORG_KEY && DEMO_IDENTITIES.get(policy.id) === policy.type) {
      inherited.push(policy);
    } else {
      own.push(policy);
    }
  }
  return { orgKey, total: policies.length, inherited, own };
}

function parseDocs(docs) {
  const rows = [];
  for (const doc of docs) {
    const id = String(doc.id ?? '');
    const suffix = '__leavePolicies';
    if (!id.endsWith(suffix)) continue;
    const orgKey = id.slice(0, -suffix.length);
    const value = doc.value;
    // A document whose value is not a list is not a policy list. Reported as
    // unreadable rather than skipped: silence here reads as "nothing found".
    if (!Array.isArray(value)) {
      rows.push({ orgKey, unreadable: true, total: 0, inherited: [], own: [] });
      continue;
    }
    rows.push(surveyOrg(orgKey, value));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Simulation fixture — the states this bug can leave behind.
// ---------------------------------------------------------------------------
const DEMO_SEVEN = [
  { id: 'lp1', type: 'Casual Leave', annual: 12, accrual: 'monthly', monthlyAccrual: 1 },
  { id: 'lp2', type: 'Sick Leave', annual: 12, accrual: 'monthly', monthlyAccrual: 1 },
  { id: 'lp3', type: 'Earned Leave', annual: 15, accrual: 'annual', monthlyAccrual: 0 },
  { id: 'lp4', type: 'Unpaid Leave', annual: 0, accrual: 'annual', monthlyAccrual: 0 },
  { id: 'lp5', type: 'Maternity Leave', annual: 182, accrual: 'annual', monthlyAccrual: 0 },
  { id: 'lp6', type: 'Paternity Leave', annual: 5, accrual: 'annual', monthlyAccrual: 0 },
  { id: 'lp7', type: 'Comp Off', annual: 0, accrual: 'annual', monthlyAccrual: 0 },
];

const SIMULATED_DOCS = [
  // The demo organisation. Its list is its own and must never be flagged.
  { id: 'default__leavePolicies', value: DEMO_SEVEN },
  // Toggled one carry-forward switch, which saved all seven as theirs.
  {
    id: 'northgate__leavePolicies',
    value: DEMO_SEVEN.map((p) => (p.id === 'lp1' ? { ...p, carryForward: false } : p)),
  },
  // Inherited, then added two of their own and deleted one they did not grant.
  {
    id: 'borealis__leavePolicies',
    value: [
      ...DEMO_SEVEN.filter((p) => p.id !== 'lp7'),
      { id: 'lp1770000000001', type: 'Study Leave', annual: 10, accrual: 'annual', monthlyAccrual: 0 },
      { id: 'lp1770000000002', type: 'Bereavement Leave', annual: 5, accrual: 'annual', monthlyAccrual: 0 },
    ],
  },
  // Wrote their own policy from scratch. Nothing inherited.
  {
    id: 'cedarworks__leavePolicies',
    value: [
      { id: 'lp1769000000001', type: 'Casual Leave', annual: 18, accrual: 'annual', monthlyAccrual: 0 },
      { id: 'lp-sick-leave', type: 'Sick Leave', annual: 24, accrual: 'annual', monthlyAccrual: 0 },
    ],
  },
  // Cleared every type deliberately. Empty is a choice, not a gap.
  { id: 'harlow__leavePolicies', value: [] },
  // A hand-edited or half-migrated document.
  { id: 'meridian__leavePolicies', value: null },
];

// ---------------------------------------------------------------------------

function report(rows) {
  const affected = rows.filter((row) => row.inherited.length > 0);
  const unreadable = rows.filter((row) => row.unreadable);
  const types = affected.reduce((sum, row) => sum + row.inherited.length, 0);

  console.log('Dry run — nothing was written.\n');
  console.log(`Organisations with a stored leave policy: ${rows.length}`);
  console.log(`Holding types nobody there chose:         ${affected.length} (${types} types)\n`);

  for (const row of rows) {
    const name = row.orgKey.padEnd(14);
    if (row.unreadable) {
      console.log(`  ${name} document is not a policy list — needs a human`);
      continue;
    }
    if (row.orgKey === DEMO_ORG_KEY) {
      console.log(`  ${name} ${row.total} types · the demo organisation, its own policy`);
      continue;
    }
    if (row.inherited.length === 0) {
      console.log(`  ${name} ${row.total} types · all its own`);
      continue;
    }
    console.log(
      `  ${name} ${row.total} types · ${row.inherited.length} inherited, ${row.own.length} its own`,
    );
    console.log(`  ${' '.repeat(14)}   would offer to remove: ${row.inherited.map((p) => p.type).join(', ')}`);
    if (row.own.length > 0) {
      console.log(`  ${' '.repeat(14)}   would keep: ${row.own.map((p) => p.type).join(', ')}`);
    }
  }

  console.log('\nWhat this run cannot answer:');
  console.log('  Whether leave has been taken under any of these types. Leave requests are a');
  console.log("  localStorage overlay with no server copy, so only that organisation's own");
  console.log('  browser knows — and a type with requests against it must be kept, or those');
  console.log('  requests are left with no policy to be measured against. Settings applies');
  console.log('  that rule at the moment of removal; a sweep from outside could not.');
  if (unreadable.length > 0) {
    console.log(`\n  ${unreadable.length} document(s) could not be read and are listed above.`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log(HELP);
  process.exit(0);
}

if (args.includes('--simulate')) {
  console.log('SIMULATION — fabricated organisations, no real data is read.\n');
  report(parseDocs(SIMULATED_DOCS));
} else {
  const at = args.indexOf('--input');
  const file = at === -1 ? null : args[at + 1];
  if (!file) {
    console.error('Need --simulate or --input <dump.json>. See --help.');
    process.exit(1);
  }
  const { readFileSync } = await import('node:fs');
  const docs = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(docs)) {
    console.error('Expected a JSON array of org_settings documents. See --help.');
    process.exit(1);
  }
  report(parseDocs(docs));
}
