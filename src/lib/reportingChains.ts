/**
 * Keeps `managerChainIds` in step with the reporting tree.
 *
 * The chain is denormalised onto every leave document so `firestore.rules` can
 * answer "is the caller this person's manager" without walking
 * `reportingManagerId` — it cannot, because the directory that field lives in
 * is localStorage-backed and neither readable nor trustworthy on the server
 * (see managesSubject() in firestore.rules and docs/salary-leave-access-spec.md
 * §4).
 *
 * Being a write-time snapshot, it goes stale the moment someone changes
 * manager, and a stale chain is not cosmetic in either direction: it withholds
 * a manager's legitimate access to their new report's leave, and after a
 * transfer it keeps granting the *former* manager access to leave they should
 * no longer see. Nothing ran the recompute — it was a manual Settings action
 * nobody had a reason to remember. This is the trigger. See G6 in
 * docs/tenant-isolation-spec.md.
 *
 * Best-effort by design, exactly like the HR role sync in
 * data/roleAssignments.ts: the directory write has already happened and is not
 * rolled back if this fails. Failure is visible in the console and the next
 * Settings → Database → "Backfill employee access mapping" run repairs it.
 */
import { backfillManagerChains } from '@/lib/accessBackfill';
import { getEmployeeDirectory } from '@/data/employees';
import { getActiveOrgKey } from '@/lib/orgScope';

/**
 * True when a directory edit moved anyone in the reporting tree.
 *
 * Checked by the caller so a routine profile edit — a phone number, an address
 * — does not issue a Firestore sweep of the organisation's leave records.
 */
export function reportingLineChanged(
  before: { reportingManagerId?: string | null } | undefined,
  after: { reportingManagerId?: string | null } | undefined,
): boolean {
  return (before?.reportingManagerId ?? null) !== (after?.reportingManagerId ?? null);
}

/**
 * Recompute every chain for the active organisation from the current directory.
 *
 * The tree is read from `getEmployeeDirectory()` rather than the Firestore
 * `employees` collection because this runs immediately after a directory write:
 * Firestore has not seen the change, so recomputing from it would rewrite the
 * stale chain and report success.
 */
export async function syncManagerChains(): Promise<void> {
  try {
    await backfillManagerChains({
      orgKey: getActiveOrgKey(),
      dryRun: false,
      reportingTree: getEmployeeDirectory().map((employee) => ({
        id: employee.id,
        managerId: employee.reportingManagerId ?? null,
      })),
    });
  } catch (err) {
    // An account without administrator reach is refused by the rules. That is
    // the rules working, not a bug here — the edit that triggered this needs
    // Employee Directory 'full', which is Admin and HR Manager.
    console.warn('[reporting-chains] could not refresh managerChainIds:', err);
  }
}
