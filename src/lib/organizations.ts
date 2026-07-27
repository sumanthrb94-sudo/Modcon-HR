/**
 * Organization creation for super admins.
 *
 * Creating an org also provisions its first administrator's Firebase Auth
 * account, with the `hr` role — an administrator of that one organisation
 * rather than a platform admin.
 * The client SDK signs in as whichever user `createUserWithEmailAndPassword`
 * creates, so that call runs on a throwaway secondary `FirebaseApp` instance
 * — this keeps the super admin's own session on the primary `auth` intact.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';
import { ADMIN_EMAILS } from './auth';
import { Collections, addNew, remove } from './db';
import { assignRole } from '@/data/roleAssignments';
import type { Organization } from '@/types';

function randomPassword(length = 14): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export interface CreateOrganizationInput {
    name: string;
    adminName: string;
    adminEmail: string;
}

export interface CreateOrganizationResult {
    orgId: string;
    adminUid: string;
    adminEmail: string;
    tempPassword: string;
}

export async function createOrganization(
    input: CreateOrganizationInput,
    createdByUid: string,
): Promise<CreateOrganizationResult> {
    const name = input.name.trim();
    const adminName = input.adminName.trim();
    const email = input.adminEmail.trim().toLowerCase();
    if (!name) throw new Error('Organization name is required.');
    if (!email) throw new Error('Admin email is required.');

    const tempPassword = randomPassword();

    const orgId = await addNew(Collections.organizations, {
        name,
        adminEmail: email,
        createdBy: createdByUid,
        createdAt: serverTimestamp(),
    } as Organization);

    const secondaryApp = initializeApp(firebaseConfig, `org-provision-${orgId}`);
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
        if (adminName) {
            await updateProfile(cred.user, { displayName: adminName });
        }
        const adminUid = cred.user.uid;

        // Written via the primary `db` as the signed-in super admin — the
        // secondary app/auth instance above is only used to mint the account.
        //
        // The role is `hr`, not `admin`. This account administers one
        // organisation: it holds the same module access as an admin but is
        // confined to its own org and cannot grant the admin role (see
        // lib/accessControl.ts and the /users rules). Provisioning it as a
        // platform admin would have handed every new organisation the ability
        // to mint further admins, which is not what "an organisation's own
        // administrator" means here.
        await setDoc(doc(db, 'users', adminUid), {
            uid: adminUid,
            email,
            displayName: adminName || email.split('@')[0],
            photoURL: null,
            role: 'hr',
            orgId,
            superAdmin: false,
            createdAt: serverTimestamp(),
            lastLoginAt: null,
        });

        // Recorded as an assignment as well as on the profile, so the role is
        // restored if the profile document is ever deleted and rebuilt by a
        // later sign-in. Best-effort: the profile above is what actually grants
        // access, and failing to write the audit trail must not undo the org.
        await assignRole({
            email,
            role: 'hr',
            orgId,
            assignedBy: createdByUid,
        }).catch(() => {});

        await updateDoc(doc(db, 'organizations', orgId), { adminUid });

        await signOut(secondaryAuth);
        return { orgId, adminUid, adminEmail: email, tempPassword };
    } catch (err) {
        await remove(Collections.organizations, orgId).catch(() => {});
        throw err;
    } finally {
        await deleteApp(secondaryApp);
    }
}

// ---------------------------------------------------------------------------
// Migration: organisations provisioned before the first account became `hr`
// ---------------------------------------------------------------------------

export interface OrgAdminMigrationCandidate {
    orgId: string;
    orgName: string;
    uid: string;
    email: string;
    /** Present when the account will be left alone, saying why. */
    skipReason?: string;
}

/**
 * Accounts that `createOrganization` provisioned as platform admins before it
 * started provisioning `hr`.
 *
 * Read-only: this is the dry run. Revoking the admin role from live accounts is
 * not something to do from a single unexplained button, so the caller shows
 * this list and asks before anything is written.
 *
 * Three kinds of account are deliberately never touched, each for a different
 * reason:
 *   - super admins, who are not an organisation's account at all;
 *   - the hard-coded ADMIN_EMAILS, whose role is re-asserted from
 *     src/lib/auth.tsx on every sign-in, so writing `hr` here would be undone
 *     on their next login and only confuse the audit trail;
 *   - anything already `hr`, which is the target state.
 */
export async function findOrgAdminsToMigrate(
    organizations: Organization[],
): Promise<OrgAdminMigrationCandidate[]> {
    const withAdmin = organizations.filter((org) => org.id && org.adminUid);

    const rows = await Promise.all(
        withAdmin.map(async (org) => {
            const snap = await getDoc(doc(db, 'users', org.adminUid as string));
            const base = {
                orgId: org.id as string,
                orgName: org.name,
                uid: org.adminUid as string,
                email: org.adminEmail,
            };
            if (!snap.exists()) return { ...base, skipReason: 'No user profile found' };

            const data = snap.data() as { role?: string; email?: string; superAdmin?: boolean };
            const email = (data.email ?? org.adminEmail ?? '').toLowerCase();
            if (data.superAdmin) return { ...base, email, skipReason: 'Super admin' };
            if (ADMIN_EMAILS.includes(email)) return { ...base, email, skipReason: 'Fixed platform admin' };
            if (data.role === 'hr') return { ...base, email, skipReason: 'Already an HR administrator' };
            if (data.role !== 'admin') return { ...base, email, skipReason: `Role is "${data.role ?? 'unset'}"` };

            return { ...base, email };
        }),
    );

    return rows;
}

/**
 * Demotes the given accounts from platform admin to HR administrator, and
 * records the matching assignment. Only candidates with no `skipReason` are
 * written; the rest are passed through untouched so the caller can report the
 * full picture.
 */
export async function migrateOrgAdminsToHr(
    candidates: OrgAdminMigrationCandidate[],
    actedByUid: string,
): Promise<{ migrated: string[]; failed: { email: string; reason: string }[] }> {
    const migrated: string[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const candidate of candidates.filter((item) => !item.skipReason)) {
        try {
            await updateDoc(doc(db, 'users', candidate.uid), { role: 'hr' });
            await assignRole({
                email: candidate.email,
                role: 'hr',
                orgId: candidate.orgId,
                assignedBy: actedByUid,
            }).catch(() => {
                // The profile write above is what changes access; the
                // assignment is only a durability record.
            });
            migrated.push(candidate.email);
        } catch (err) {
            failed.push({ email: candidate.email, reason: (err as Error)?.message ?? 'Unknown error' });
        }
    }

    return { migrated, failed };
}

/**
 * Points an existing account at an organisation as its HR administrator.
 *
 * `createOrganization` mints a brand new account; this is the other case —
 * someone already has a login and needs to become (or replace) an
 * organisation's administrator. Nothing could do that before: the Admin
 * dashboard changes a role but never an `orgId`, so an existing account could
 * not be attached to an organisation at all.
 *
 * Writes the role and the org membership together, because either alone is
 * wrong: the role without the `orgId` is an administrator of nothing, and the
 * `orgId` without the role is an ordinary employee of that org.
 */
export async function setOrgHrAdministrator(
    params: { orgId: string; orgName: string; email: string },
    actedByUid: string,
): Promise<{ uid: string; email: string; replaced?: string }> {
    const email = params.email.trim().toLowerCase();
    if (!email) throw new Error('Enter the account email.');

    const matches = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
    if (matches.empty) {
        throw new Error(
            'No account exists with that email. They need to sign up first, or use Create Organization to provision a new account.',
        );
    }
    if (matches.size > 1) {
        throw new Error('More than one account uses that email. Resolve the duplicate before assigning.');
    }

    const snap = matches.docs[0];
    const data = snap.data() as { role?: string; superAdmin?: boolean; orgId?: string };

    // A super admin is not an organisation's account, and pinning them to one
    // org would strip the cross-org access their role exists for.
    if (data.superAdmin) throw new Error('That account is a super admin and cannot be scoped to one organization.');
    // Their role is re-asserted from ADMIN_EMAILS on every sign-in, so writing
    // `hr` here would be silently undone at their next login.
    if (ADMIN_EMAILS.includes(email)) {
        throw new Error('That account is a fixed platform admin; its role is reset on every sign-in.');
    }
    if (data.orgId && data.orgId !== params.orgId) {
        throw new Error(`That account already belongs to another organization (${data.orgId}). Move them there first.`);
    }

    await updateDoc(doc(db, 'users', snap.id), { role: 'hr', orgId: params.orgId });
    await assignRole({ email, role: 'hr', orgId: params.orgId, assignedBy: actedByUid }).catch(() => {
        // The profile write above is what grants access; this is durability only.
    });

    const orgSnap = await getDoc(doc(db, 'organizations', params.orgId));
    const previous = orgSnap.exists() ? (orgSnap.data().adminEmail as string | undefined) : undefined;
    await updateDoc(doc(db, 'organizations', params.orgId), { adminEmail: email, adminUid: snap.id });

    return {
        uid: snap.id,
        email,
        ...(previous && previous !== email ? { replaced: previous } : {}),
    };
}

export function friendlyOrgError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    const map: Record<string, string> = {
        'auth/email-already-in-use': 'That admin email is already registered to an account.',
        'auth/invalid-email': 'Enter a valid admin email address.',
        'auth/weak-password': 'Could not set a valid temporary password. Please try again.',
    };
    return map[code] ?? 'Something went wrong creating the organization. Please try again.';
}
