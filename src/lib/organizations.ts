/**
 * Organization creation for super admins.
 *
 * Creating an org also provisions its first admin's Firebase Auth account.
 * The client SDK signs in as whichever user `createUserWithEmailAndPassword`
 * creates, so that call runs on a throwaway secondary `FirebaseApp` instance
 * — this keeps the super admin's own session on the primary `auth` intact.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase';
import { Collections, addNew, remove } from './db';
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
        await setDoc(doc(db, 'users', adminUid), {
            uid: adminUid,
            email,
            displayName: adminName || email.split('@')[0],
            photoURL: null,
            role: 'admin',
            orgId,
            superAdmin: false,
            createdAt: serverTimestamp(),
            lastLoginAt: null,
        });

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

export function friendlyOrgError(err: unknown): string {
    const code = (err as { code?: string })?.code ?? '';
    const map: Record<string, string> = {
        'auth/email-already-in-use': 'That admin email is already registered to an account.',
        'auth/invalid-email': 'Enter a valid admin email address.',
        'auth/weak-password': 'Could not set a valid temporary password. Please try again.',
    };
    return map[code] ?? 'Something went wrong creating the organization. Please try again.';
}
