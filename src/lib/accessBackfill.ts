/**
 * Backfills for the two denormalisations that access control depends on.
 *
 * `orgId` (see ./orgBackfill.ts) made existing records visible again. These two
 * make the *per-employee* tiers of firestore.rules actually resolve against
 * data that predates them:
 *
 *   employee_links   uid -> employeeId, so isSelf() can match. Without a link
 *                    an account resolves to no employee and reads none of its
 *                    own salary or leave — the rules fail closed.
 *   managerChainIds  the reporting chain stamped onto each leave document, so
 *                    managesSubject() can match. Without it a manager reads
 *                    none of their reports' leave.
 *
 * Both fail closed, so running them grants access that is currently withheld.
 * Both therefore support a dry run, and the link backfill refuses to guess.
 */
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ORG_KEY } from './orgScope';

const BATCH_SIZE = 400;

// ---------------------------------------------------------------------------
// employee_links
// ---------------------------------------------------------------------------

export interface LinkCandidate {
  uid: string;
  email: string;
  employeeId: string;
  employeeName: string;
}

export interface LinkBackfillResult {
  linked: LinkCandidate[];
  /** Accounts with no unambiguous employee record, and why. */
  skipped: Array<{ uid: string; email: string; reason: string }>;
  alreadyLinked: number;
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Link accounts to employee records by email.
 *
 * Email is the only signal the server has: `Employee.authUid` is written to
 * localStorage, never to Firestore, and would be a client-controlled claim
 * even if it were there.
 *
 * Deliberately conservative — a wrong link is not a cosmetic bug, it hands
 * someone another employee's salary. So an account is linked only when exactly
 * one employee in the organisation carries that email. No account, no email, a
 * duplicate email or no match at all is skipped and reported, never guessed.
 * An existing link is never overwritten; correcting one is a manual act.
 */
export async function backfillEmployeeLinks(options: {
  orgKey?: string;
  dryRun?: boolean;
  linkedBy?: string;
  onProgress?: (message: string) => void;
} = {}): Promise<LinkBackfillResult> {
  const orgKey = options.orgKey || DEFAULT_ORG_KEY;
  const dryRun = options.dryRun ?? false;
  const log = (message: string) => {
    console.log(`[link-backfill] ${message}`);
    options.onProgress?.(message);
  };

  log(dryRun ? 'Dry run — matching accounts to employee records by email.'
             : 'Matching accounts to employee records by email.');

  const [userSnap, employeeSnap, linkSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(query(collection(db, 'employees'), where('orgId', '==', orgKey))),
    getDocs(collection(db, 'employee_links')),
  ]);

  const existingLinks = new Set(linkSnap.docs.map((d) => d.id));

  // Emails claimed by more than one employee are ambiguous and get no link.
  const byEmail = new Map<string, { id: string; name: string }[]>();
  employeeSnap.docs.forEach((d) => {
    const email = normalizeEmail(d.data().email);
    if (!email) return;
    const entry = { id: d.id, name: String(d.data().fullName ?? d.id) };
    const list = byEmail.get(email);
    if (list) list.push(entry);
    else byEmail.set(email, [entry]);
  });

  const linked: LinkCandidate[] = [];
  const skipped: LinkBackfillResult['skipped'] = [];
  let alreadyLinked = 0;

  for (const userDoc of userSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const email = normalizeEmail(data.email);

    if (existingLinks.has(uid)) { alreadyLinked += 1; continue; }
    // Only accounts belonging to this organisation. Accounts with no orgId are
    // the legacy/default tenant, matching how the rules read them.
    const userOrg = (data.orgId as string | undefined) || DEFAULT_ORG_KEY;
    if (userOrg !== orgKey) {
      skipped.push({ uid, email, reason: `belongs to organisation "${userOrg}"` });
      continue;
    }
    if (!email) { skipped.push({ uid, email: '(none)', reason: 'account has no email' }); continue; }

    const matches = byEmail.get(email) ?? [];
    if (matches.length === 0) {
      skipped.push({ uid, email, reason: 'no employee record with this email' });
      continue;
    }
    if (matches.length > 1) {
      skipped.push({ uid, email, reason: `${matches.length} employee records share this email — link manually` });
      continue;
    }

    linked.push({ uid, email, employeeId: matches[0].id, employeeName: matches[0].name });
  }

  if (!dryRun && linked.length) {
    for (let i = 0; i < linked.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      linked.slice(i, i + BATCH_SIZE).forEach((c) => {
        batch.set(doc(db, 'employee_links', c.uid), {
          uid: c.uid,
          employeeId: c.employeeId,
          ...(orgKey === DEFAULT_ORG_KEY ? {} : { orgId: orgKey }),
          linkedBy: options.linkedBy ?? 'backfill',
        });
      });
      await batch.commit();
    }
  }

  linked.forEach((c) => log(`${dryRun ? 'would link' : 'linked'}: ${c.email} → ${c.employeeId} (${c.employeeName})`));
  skipped.forEach((s) => log(`skipped ${s.email}: ${s.reason}`));
  log(`${alreadyLinked} account(s) already linked.`);
  log(dryRun
    ? `Dry run complete — ${linked.length} account(s) would be linked, ${skipped.length} skipped.`
    : `✅ Linked ${linked.length} account(s); ${skipped.length} skipped.`);

  return { linked, skipped, alreadyLinked };
}

// ---------------------------------------------------------------------------
// managerChainIds
// ---------------------------------------------------------------------------

export interface ChainBackfillResult {
  collection: string;
  scanned: number;
  updated: number;
  error?: string;
}

/** Every employee id above each employee in the reporting tree, from Firestore. */
function buildChains(rows: Array<{ id: string; managerId: string | null }>): Map<string, string[]> {
  const managerOf = new Map(rows.map((r) => [r.id, r.managerId]));
  const chains = new Map<string, string[]>();

  for (const row of rows) {
    const chain: string[] = [];
    const seen = new Set<string>([row.id]);
    let current = managerOf.get(row.id) ?? null;
    // Cycle guard: reporting lines are editable, so A→B→A is reachable.
    while (current && !seen.has(current)) {
      chain.push(current);
      seen.add(current);
      current = managerOf.get(current) ?? null;
    }
    chains.set(row.id, chain);
  }
  return chains;
}

function sameChain(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Stamp the reporting chain onto existing leave documents.
 *
 * Read from the `employees` collection rather than the static seed array, so
 * the chain reflects the reporting lines actually stored rather than the demo
 * dataset's. Idempotent: a document whose chain already matches is left alone,
 * so this is safe to re-run after a reorganisation — which it will need, since
 * the chain is a snapshot and goes stale whenever someone changes manager.
 */
export async function backfillManagerChains(options: {
  orgKey?: string;
  dryRun?: boolean;
  onProgress?: (message: string) => void;
} = {}): Promise<ChainBackfillResult[]> {
  const orgKey = options.orgKey || DEFAULT_ORG_KEY;
  const dryRun = options.dryRun ?? false;
  const log = (message: string) => {
    console.log(`[chain-backfill] ${message}`);
    options.onProgress?.(message);
  };

  log(dryRun ? 'Dry run — recomputing reporting chains for leave records.'
             : 'Recomputing reporting chains for leave records.');

  const employeeSnap = await getDocs(query(collection(db, 'employees'), where('orgId', '==', orgKey)));
  const chains = buildChains(
    employeeSnap.docs.map((d) => ({
      id: d.id,
      managerId: (d.data().reportingManagerId as string | null) ?? null,
    })),
  );
  log(`Reporting tree built from ${employeeSnap.size} employee record(s).`);

  const results: ChainBackfillResult[] = [];

  for (const name of ['leave_requests', 'leave_balances']) {
    try {
      const snap = await getDocs(query(collection(db, name), where('orgId', '==', orgKey)));
      const stale = snap.docs.filter((d) => {
        const employeeId = d.data().employeeId as string | undefined;
        if (!employeeId) return false;
        return !sameChain(d.data().managerChainIds, chains.get(employeeId) ?? []);
      });

      if (!dryRun && stale.length) {
        for (let i = 0; i < stale.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          stale.slice(i, i + BATCH_SIZE).forEach((d) => {
            const employeeId = d.data().employeeId as string;
            batch.update(d.ref, { managerChainIds: chains.get(employeeId) ?? [] });
          });
          await batch.commit();
        }
      }

      log(`${name}: ${stale.length} of ${snap.size} document(s) ${dryRun ? 'would be' : ''} updated.`);
      results.push({ collection: name, scanned: snap.size, updated: stale.length });
    } catch (err) {
      const message = String(err);
      log(`⚠️  ${name}: ${message}`);
      results.push({ collection: name, scanned: 0, updated: 0, error: message });
    }
  }

  const total = results.reduce((sum, r) => sum + r.updated, 0);
  log(dryRun ? `Dry run complete — ${total} document(s) would be updated.`
             : `✅ Chain backfill complete — ${total} document(s) updated.`);
  return results;
}
