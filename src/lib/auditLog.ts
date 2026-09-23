/**
 * The platform audit log — `audit_logs` in Firestore.
 *
 * `firestore.rules` is the contract this module has to match exactly (see the
 * "Platform audit log" block there): `actorUid` must equal the caller's own
 * uid, `at` must be `serverTimestamp()`, and the key set is closed to
 * `actorUid`, `actorEmail`, `at`, `action`, `orgId`, `orgName`. A write that
 * disagrees with any of that is refused, not silently narrowed — this module
 * does not try to be more lenient than the rules it is written against.
 *
 * Entries are append-only, readable by super admins and by an organisation's
 * Administrator for that organisation (see AuditLogPanel); there is no update
 * or delete path here to match.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface AuditLogEntry {
    /** Short, stable action string — e.g. `'super_admin.enter_org'`. */
    action: string;
    orgId: string;
    orgName?: string;
}

/**
 * Files one audit entry for the signed-in super admin. Throws (rather than
 * swallowing the error) when there is no signed-in user or the write is
 * refused — the caller decides what an unaudited action means for the flow
 * it is guarding; this module's only job is to not paper over the failure.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('Cannot write an audit entry: nobody is signed in.');
    }
    const payload: Record<string, unknown> = {
        actorUid: user.uid,
        at: serverTimestamp(),
        action: entry.action,
        orgId: entry.orgId,
    };
    if (user.email) payload.actorEmail = user.email;
    if (entry.orgName) payload.orgName = entry.orgName;
    await addDoc(collection(db, 'audit_logs'), payload);
}
