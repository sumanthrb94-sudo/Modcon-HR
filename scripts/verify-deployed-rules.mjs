/**
 * Check that the *deployed* Firestore ruleset is the one in this working tree.
 *
 * This closes the last gap in simulation-only testing. The emulator evaluates
 * `firestore.rules` from disk, so an emulated run proves the rules in the repo
 * behave — not that production is running them. That used to be the one reason
 * to run against the live project.
 *
 * It does not need to be. The Firebase Rules API serves the deployed ruleset's
 * source, so the question "is production running these rules?" is answerable by
 * comparing bytes. This reads two endpoints on firebaserules.googleapis.com and
 * touches no Firestore data at all — no documents, no quota, nothing to strand.
 *
 * Exit 0 when they match (the emulated run therefore covers the deployed rules),
 * 1 when they differ (deploy first — `npm run rules:deploy` — or find out who
 * deployed something else), 2 when the check itself could not run.
 *
 * Auth comes from the Firebase CLI's own stored credential, the same one
 * `firebase deploy` uses. If you are not logged in, run `firebase login`.
 *
 * A service-account key works too, and is what to reach for when the CLI is not
 * logged in: set GOOGLE_APPLICATION_CREDENTIALS and mint a token from it. Note
 * that the default `firebase-adminsdk` service account can read and write rules
 * but **cannot create indexes** (`datastore.indexes.create`), and `firebase
 * deploy` refuses before it starts because it also lacks
 * `serviceusage.services.get` — so a key-based deploy has to call the Rules API
 * directly rather than going through the CLI.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'modconhr-b2789';
const LOCAL_RULES = 'firestore.rules';
// Public client credentials of firebase-tools, as shipped in its source.
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function fail(code, message) {
  console.error(`✗ ${message}`);
  process.exit(code);
}

let refreshToken;
try {
  const cfg = JSON.parse(
    readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'),
  );
  refreshToken = cfg?.tokens?.refresh_token;
} catch {
  fail(2, 'no Firebase CLI credential found — run `firebase login` first.');
}
if (!refreshToken) fail(2, 'Firebase CLI credential has no refresh token — run `firebase login`.');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  }),
});
if (!tokenRes.ok) fail(2, `could not exchange the CLI credential: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token: token } = await tokenRes.json();

const api = async (url) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) fail(2, `${url} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const { releases = [] } = await api(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`);
const release = releases.find((r) => r.name.endsWith('cloud.firestore'));
if (!release) fail(2, `no cloud.firestore release found on project ${PROJECT}.`);

const ruleset = await api(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
const deployed = ruleset.source.files[0].content;
const local = readFileSync(LOCAL_RULES, 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');

console.log(`release  ${release.name}`);
console.log(`ruleset  ${release.rulesetName}`);
console.log(`deployed sha256 ${sha(deployed)}`);
console.log(`local    sha256 ${sha(local)}`);

if (deployed === local) {
  console.log('✓ deployed ruleset is byte-identical to firestore.rules — the emulated run covers production.');
  process.exit(0);
}

console.error('✗ the deployed ruleset differs from firestore.rules.');
console.error('  An emulated test run therefore does NOT tell you how production behaves.');
console.error('  Deploy the working tree with `npm run rules:deploy`, or find out what is deployed and why.');
const dLines = deployed.split('\n');
const lLines = local.split('\n');
for (let i = 0; i < Math.max(dLines.length, lLines.length); i += 1) {
  if (dLines[i] !== lLines[i]) {
    console.error(`  first difference at line ${i + 1}:`);
    console.error(`    deployed: ${dLines[i] ?? '(end of file)'}`);
    console.error(`    local:    ${lLines[i] ?? '(end of file)'}`);
    break;
  }
}
process.exit(1);
