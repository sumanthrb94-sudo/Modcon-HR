/**
 * Support chat — an organisation's HR talking to the platform.
 *
 * The Super Admin cannot see an organisation's HR data (gate G3), so this is
 * how the two sides reach each other: an HR Manager or Administrator opens a
 * conversation, the Super Admin answers it, either side resolves or reopens
 * it. `firestore.rules` ("Support chat") is the contract: a thread is its
 * organisation's, messages are append-only, and each side posts as itself.
 */
import {
    addDoc,
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
    type Timestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type SupportSide = 'org' | 'platform';
export type SupportStatus = 'open' | 'resolved';

export interface SupportThread {
    id: string;
    orgId: string;
    orgName?: string;
    subject: string;
    status: SupportStatus;
    createdByEmail?: string;
    createdAt: Date | null;
    lastMessageAt: Date | null;
    lastMessageBy: SupportSide;
}

export interface SupportMessage {
    id: string;
    authorEmail?: string;
    authorSide: SupportSide;
    text: string;
    at: Date | null;
}

export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_TEXT_MAX = 4000;

const toDate = (value: unknown) => (value && typeof (value as Timestamp).toDate === 'function'
    ? (value as Timestamp).toDate()
    : null);

/**
 * Every thread this account may read, newest activity first.
 *
 * The Super Admin reads all of them. An organisation reads its own, and has to
 * say so in the query (`orgId ==`), because the rules evaluate a list against
 * every document it returns. Sorted here rather than with orderBy so that
 * query needs no composite index.
 */
export function subscribeSupportThreads(
    scope: { superAdmin: true } | { superAdmin: false; orgId: string },
    onChange: (threads: SupportThread[]) => void,
    onError: (message: string) => void,
): () => void {
    const source = scope.superAdmin
        ? query(collection(db, 'support_threads'), orderBy('lastMessageAt', 'desc'), limit(200))
        : query(collection(db, 'support_threads'), where('orgId', '==', scope.orgId));
    return onSnapshot(
        source,
        (snap) => {
            const threads = snap.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    orgId: data.orgId,
                    orgName: data.orgName,
                    subject: data.subject,
                    status: data.status,
                    createdByEmail: data.createdByEmail,
                    createdAt: toDate(data.createdAt),
                    lastMessageAt: toDate(data.lastMessageAt),
                    lastMessageBy: data.lastMessageBy,
                } as SupportThread;
            });
            threads.sort((a, b) => (b.lastMessageAt?.getTime() ?? Infinity) - (a.lastMessageAt?.getTime() ?? Infinity));
            onChange(threads);
        },
        () => onError('Conversations could not be loaded.'),
    );
}

export function subscribeSupportMessages(
    threadId: string,
    onChange: (messages: SupportMessage[]) => void,
    onError: (message: string) => void,
): () => void {
    return onSnapshot(
        query(collection(db, 'support_threads', threadId, 'messages'), orderBy('at', 'asc')),
        (snap) => onChange(snap.docs.map((d) => {
            const data = d.data();
            return {
                id: d.id,
                authorEmail: data.authorEmail,
                authorSide: data.authorSide,
                text: data.text,
                at: toDate(data.at),
            };
        })),
        () => onError('Messages could not be loaded.'),
    );
}

function signedIn() {
    const user = auth.currentUser;
    if (!user) throw new Error('You are not signed in.');
    return user;
}

/** Open a conversation for this organisation, with its first message. */
export async function openSupportThread(input: {
    orgId: string;
    orgName?: string;
    subject: string;
    text: string;
}): Promise<string> {
    const user = signedIn();
    const subject = input.subject.trim().slice(0, SUPPORT_SUBJECT_MAX);
    const text = input.text.trim().slice(0, SUPPORT_TEXT_MAX);
    if (!subject || !text) throw new Error('A subject and a message are both needed.');
    const thread = await addDoc(collection(db, 'support_threads'), {
        orgId: input.orgId,
        ...(input.orgName ? { orgName: input.orgName } : {}),
        subject,
        status: 'open',
        createdByUid: user.uid,
        ...(user.email ? { createdByEmail: user.email } : {}),
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageBy: 'org',
    });
    // Second, not batched: the message rule reads the thread to decide who may
    // post, and inside a batch that read would see the thread not yet there.
    await addDoc(collection(db, 'support_threads', thread.id, 'messages'), {
        authorUid: user.uid,
        ...(user.email ? { authorEmail: user.email } : {}),
        authorSide: 'org',
        text,
        at: serverTimestamp(),
    });
    return thread.id;
}

/** Reply on a thread. A reply reopens a resolved conversation. */
export async function replySupportThread(threadId: string, side: SupportSide, textInput: string): Promise<void> {
    const user = signedIn();
    const text = textInput.trim().slice(0, SUPPORT_TEXT_MAX);
    if (!text) throw new Error('Write a message first.');
    await addDoc(collection(db, 'support_threads', threadId, 'messages'), {
        authorUid: user.uid,
        ...(user.email ? { authorEmail: user.email } : {}),
        authorSide: side,
        text,
        at: serverTimestamp(),
    });
    await updateDoc(doc(db, 'support_threads', threadId), {
        status: 'open',
        lastMessageAt: serverTimestamp(),
        lastMessageBy: side,
    });
}

export async function setSupportThreadStatus(threadId: string, status: SupportStatus, side: SupportSide): Promise<void> {
    await updateDoc(doc(db, 'support_threads', threadId), { status, lastMessageBy: side, lastMessageAt: serverTimestamp() });
}
