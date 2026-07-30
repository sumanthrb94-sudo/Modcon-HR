/**
 * Stamps `orgId` onto Firestore documents written before multi-tenancy.
 *
 * Why this is required rather than nice to have: `firestore.rules` reads a
 * document with no `orgId` as belonging to the default organisation, so legacy
 * data stays *readable* the moment the org-scoped rules deploy. But Firestore
 * equality filters do not match documents that are missing the field at all —
 * `where('orgId','==','default')` returns nothing for them. Every org-scoped
 * query in the app is exactly that filter, so an un-backfilled record is
 * permitted-but-invisible: it silently drops out of every list.
 *
 * That asymmetry is the whole reason this exists. The rules fail open for
 * legacy data (deliberately, so nothing 404s mid-migration) while the queries
 * fail closed, and only writing the field reconciles the two.
 *
 * Run by a super admin, or by the default organisation's administrator before
 * any second organisation has data — it reads each collection unfiltered, which
 * the rules permit only when every document already belongs to the caller's org
 * (or the caller is a super admin, who bypasses the check).
 */
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_ORG_KEY } from './orgScope';

const BATCH_SIZE = 400;

/** Collections carrying tenant data. Mirrors SEEDED_COLLECTION_NAMES in seed.ts
 *  plus the billing collections, which are written outside the seed. */
export const ORG_SCOPED_COLLECTIONS = [
  'employees',
  'employee_compensation',
  'attendance',
  'leave_requests',
  'leave_balances',
  'payslips',
  'payroll_runs',
  'jobs',
  'candidates',
  'onboarding',
  'goals',
  'performance_reviews',
  'expenses',
  'assets',
  'helpdesk_tickets',
  'regularizations',
  'billing_preferences',
  'billing_invoices',
  // Handbook versions were always stamped, but a legacy org stamped `null`
  // rather than the 'default' sentinel, which no equality filter matches. Now
  // that the read rule is org-scoped the query carries that filter, so those
  // documents need repairing like any unstamped one — see handbookOrgId in
  // src/lib/handbook.ts.
  'handbook_versions',
] as const;

export interface BackfillResult {
  collection: string;
  scanned: number;
  stamped: number;
  /** Set when the collection could not be read or written at all. */
  error?: string;
}

/**
 * Assign every document lacking an `orgId` to `orgKey`.
 *
 * Idempotent, and never overwrites an `orgId` that is already set — re-running
 * is safe, and a document already claimed by another organisation is left
 * alone rather than quietly reassigned.
 *
 * `dryRun` reports what would change without writing, because this touches
 * every tenant record in the database and "see the number first" is the
 * difference between a migration and an incident.
 */
export async function backfillOrgIds(options: {
  orgKey?: string;
  dryRun?: boolean;
  onProgress?: (message: string) => void;
} = {}): Promise<BackfillResult[]> {
  const orgKey = options.orgKey || DEFAULT_ORG_KEY;
  const dryRun = options.dryRun ?? false;
  const log = (message: string) => {
    console.log(`[org-backfill] ${message}`);
    options.onProgress?.(message);
  };

  log(dryRun
    ? `Dry run — assigning documents with no orgId to "${orgKey}".`
    : `Assigning documents with no orgId to "${orgKey}".`);

  const results: BackfillResult[] = [];

  for (const name of ORG_SCOPED_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, name));
      // `== null` rather than `=== undefined`: an explicit `orgId: null` is as
      // invisible to `where('orgId','==',orgKey)` as an absent field, and the
      // handbook wrote exactly that for legacy orgs. `orgKeyOf()` in
      // firestore.rules reads both as 'default', so both need the same repair.
      const missing = snap.docs.filter((d) => d.data().orgId == null);

      if (missing.length === 0) {
        log(`${name}: ${snap.size} document(s), none missing orgId.`);
        results.push({ collection: name, scanned: snap.size, stamped: 0 });
        continue;
      }

      if (!dryRun) {
        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          missing.slice(i, i + BATCH_SIZE).forEach((d) => {
            // update(), not set-with-merge: this must fail loudly on a document
            // that has since been deleted rather than recreating it as a husk
            // carrying nothing but an orgId.
            batch.update(d.ref, { orgId: orgKey });
          });
          await batch.commit();
        }
      }

      log(`${name}: ${missing.length} of ${snap.size} document(s) ${dryRun ? 'would be' : ''} stamped.`);
      results.push({ collection: name, scanned: snap.size, stamped: missing.length });
    } catch (err) {
      const message = String(err);
      log(`⚠️  ${name}: ${message}`);
      results.push({ collection: name, scanned: 0, stamped: 0, error: message });
    }
  }

  const identity = await backfillIdentityOrgIds({ orgKey, dryRun, log });
  results.push(...identity);

  const stamped = results.reduce((sum, r) => sum + r.stamped, 0);
  const failed = results.filter((r) => r.error);
  log(dryRun
    ? `Dry run complete — ${stamped} document(s) would be stamped.`
    : `✅ Backfill complete — ${stamped} document(s) stamped.`);
  if (failed.length) {
    log(`⚠️  ${failed.length} collection(s) could not be processed: ${failed.map((f) => f.collection).join(', ')}`);
  }

  return results;
}

/**
 * The identity collections — `users`, `employee_links`, `role_assignments`.
 *
 * Separate from the loop above because they are not tenant *data*: they carry
 * their own tenancy and their own rules, and they need one exception the data
 * collections do not. They are backfilled for the same reason all the same:
 * once `/users` reads are org-scoped, an HR manager's query must carry
 * `where('orgId','==',...)`, and that filter matches neither a missing field
 * nor a null one. Leaving the legacy tenant's accounts unstamped would show its
 * HR manager an empty Admin dashboard — permitted but unreachable, exactly the
 * asymmetry in docs/multi-tenancy-spec.md §4.
 *
 * The exception: **super admins are never stamped.** They are not members of an
 * organisation — they administer every one and switch between them — so
 * recording them as belonging to a tenant would be wrong even though
 * `isSuperAdmin()` short-circuits every check that would notice.
 */
const IDENTITY_COLLECTIONS = ['users', 'employee_links', 'role_assignments'] as const;

async function backfillIdentityOrgIds(options: {
  orgKey: string;
  dryRun: boolean;
  log: (message: string) => void;
}): Promise<BackfillResult[]> {
  const { orgKey, dryRun, log } = options;
  const results: BackfillResult[] = [];

  for (const name of IDENTITY_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, name));
      const missing = snap.docs.filter(
        (d) => d.data().orgId == null && d.data().superAdmin !== true,
      );
      const skippedSupers = snap.docs.filter(
        (d) => d.data().orgId == null && d.data().superAdmin === true,
      ).length;

      if (!dryRun && missing.length) {
        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          missing.slice(i, i + BATCH_SIZE).forEach((d) => {
            batch.update(d.ref, { orgId: orgKey });
          });
          await batch.commit();
        }
      }

      log(`${name}: ${missing.length} of ${snap.size} document(s) ${dryRun ? 'would be' : ''} stamped${
        skippedSupers ? `, ${skippedSupers} super admin(s) left unstamped` : ''
      }.`);
      results.push({ collection: name, scanned: snap.size, stamped: missing.length });
    } catch (err) {
      const message = String(err);
      log(`⚠️  ${name}: ${message}`);
      results.push({ collection: name, scanned: 0, stamped: 0, error: message });
    }
  }

  return results;
}
