/**
 * The tenant's commercial standing: the trial, what ends it, and paying.
 *
 * The storage half; `data/subscriptionRules.ts` holds the state machine and
 * imports nothing so it can be unit tested. Same split as statutory, shifts and
 * geofencing before it.
 *
 * ## Where it lives, and why that is the whole security model
 *
 * On `organizations/{orgId}`, which `firestore.rules` already makes
 * **readable by its own tenant and writable only by a super admin**. That one
 * fact is what makes a trial a trial: an organisation cannot extend its own,
 * mark itself paid, or comp itself, however much of the client it rewrites.
 *
 * It also means an organisation cannot *pay*, which is the thing this file has
 * to solve. The answer is `subscription_requests`: an org administrator may
 * **create** a request — "we want to activate", "here is the reference of the
 * transfer we made" — and may read their own. Only a super admin can read them
 * all, and only a super admin can act on one by writing the subscription. The
 * tenant asks; the platform grants. Nothing else is safe without a server.
 *
 * ## What is NOT here, and must be before money moves
 *
 * There is no charge. A payment provider's client SDK can collect a card, but
 * the only trustworthy signal that money arrived is a **webhook to a server**,
 * verified against the provider's signature — and this project has no backend
 * to receive one. Anything a browser reports about a payment is a claim by the
 * party who owes the money.
 *
 * So the seam is deliberate: `requestActivation` records the intent and the
 * provider reference, a super admin confirms against the provider's own
 * dashboard, and `grantPaidTerm` writes the term. That is a manual step and it
 * is honest about being one. When a Cloud Function exists, it replaces the
 * *confirmation*, not the shape — the request document and `grantPaidTerm` are
 * exactly what a webhook handler would call.
 */
import { useEffect, useState } from 'react';
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getActiveOrgKey } from '@/lib/orgScope';
import {
    resolveSubscription,
    startTrial,
    type SubscriptionRecord,
    type SubscriptionStatus,
    type TrialEndBehaviour,
} from '@/data/subscriptionRules';

export type {
    SubscriptionRecord,
    SubscriptionState,
    SubscriptionStatus,
    TrialEndBehaviour,
} from '@/data/subscriptionRules';
export {
    DEFAULT_GRACE_DAYS,
    DEFAULT_TRIAL_DAYS,
    LOCKED_CAPABILITIES,
    formatPaise,
    resolveSubscription,
} from '@/data/subscriptionRules';

export const SUBSCRIPTION_REQUESTS = 'subscription_requests';

/** Read a subscription off whatever an organisation document happens to hold. */
export function subscriptionOf(data: Record<string, unknown> | undefined): SubscriptionRecord {
    if (!data || typeof data !== 'object') return {};
    const pick = <T>(key: string, guard: (value: unknown) => boolean): T | undefined =>
        guard(data[key]) ? (data[key] as T) : undefined;
    const str = (value: unknown) => typeof value === 'string' && value.length > 0;
    const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

    return {
        trialStartedAt: pick<string>('trialStartedAt', str),
        trialEndsAt: pick<string>('trialEndsAt', str),
        trialPricePaise: pick<number>('trialPricePaise', num),
        graceDays: pick<number>('graceDays', num),
        trialEndBehaviour: data.trialEndBehaviour === 'stayActive' ? 'stayActive' : undefined,
        paidThrough: pick<string>('paidThrough', str),
        seats: pick<number>('seats', num),
        planName: pick<string>('planName', str),
        overrideUntil: pick<string>('overrideUntil', str),
        overrideReason: pick<string>('overrideReason', str),
        overrideBy: pick<string>('overrideBy', str),
        overrideAt: pick<string>('overrideAt', str),
        suspended: data.suspended === true ? true : undefined,
        suspendedReason: pick<string>('suspendedReason', str),
    };
}

/**
 * Subscribe to this organisation's standing.
 *
 * Starts at `active` and stays there until the document arrives, so a page that
 * renders before the read lands does not flash a lock screen at a paying
 * customer — and a read that never lands leaves them working, which is the
 * direction `resolveSubscription` fails in for the same reason.
 *
 * The countdown is recomputed on a timer as well as on a snapshot, because the
 * thing that changes a trial into a grace period is the clock, and nothing
 * writes to Firestore when midnight passes. Hourly: the states are measured in
 * days, and a tab open overnight should not be a tab that missed the change.
 */
export function useSubscription(): {
    status: SubscriptionStatus;
    record: SubscriptionRecord;
    loading: boolean;
} {
    const [record, setRecord] = useState<SubscriptionRecord>({});
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const orgKey = getActiveOrgKey();
        if (!orgKey) {
            setLoading(false);
            return;
        }
        const unsubscribe = onSnapshot(
            doc(db, 'organizations', orgKey),
            (snapshot) => {
                setRecord(subscriptionOf(snapshot.data() as Record<string, unknown> | undefined));
                setLoading(false);
            },
            () => {
                // Unreadable is not expired. See the note at the top of
                // data/subscriptionRules.ts: an empty record resolves to active.
                setRecord({});
                setLoading(false);
            },
        );
        return unsubscribe;
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setTick((current) => current + 1), 60 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);

    void tick;
    return { status: resolveSubscription(record), record, loading };
}

// ---------------------------------------------------------------------------
// What a super admin can do
// ---------------------------------------------------------------------------

/**
 * Put an organisation on a trial.
 *
 * Super-admin only — enforced by the rules on `/organizations`, not by this
 * function. Writes the fields `startTrial` computes and clears the two things
 * that would silently override them: a stale suspension, and an old override.
 * Leaving either would produce an organisation shown a fresh trial that is
 * being carried by something else, and nobody would know which.
 */
export async function beginTrial(params: {
    orgId: string;
    days?: number;
    pricePaise?: number;
    graceDays?: number;
    behaviour?: TrialEndBehaviour;
    planName?: string;
    seats?: number;
}): Promise<void> {
    if (!params.orgId) return;
    const trial = startTrial(params);
    await updateDoc(doc(db, 'organizations', params.orgId), {
        ...trial,
        suspended: false,
        suspendedReason: '',
        overrideUntil: '',
        overrideReason: '',
    });
}

/**
 * Record that an organisation has paid, through a date.
 *
 * Separate from `override` on purpose: "this customer paid" and "somebody
 * decided to carry them" have to stay distinguishable. A comp recorded as a
 * payment is a comp nobody can find again — and it will be looked for again, at
 * renewal, by somebody who was not there when it was granted.
 *
 * This is the function a payment webhook would call, unchanged, once there is a
 * server to receive one.
 */
export async function grantPaidTerm(params: {
    orgId: string;
    paidThroughIso: string;
    planName?: string;
    seats?: number;
}): Promise<void> {
    if (!params.orgId || !params.paidThroughIso) return;
    await updateDoc(doc(db, 'organizations', params.orgId), {
        paidThrough: params.paidThroughIso,
        ...(params.planName ? { planName: params.planName } : {}),
        ...(Number.isFinite(params.seats) ? { seats: params.seats } : {}),
        suspended: false,
        suspendedReason: '',
    });
}

/**
 * Carry an organisation past its dates, with a reason and a name against it.
 *
 * The reason is **required**, and that is not politeness. An override with no
 * reason is indistinguishable from a mistake six months later, and the person
 * who finds it will either revoke a promise somebody made or honour one nobody
 * did. `overrideBy` and `overrideAt` are stamped for the same reason.
 */
export async function overrideSubscription(params: {
    orgId: string;
    untilIso: string;
    reason: string;
    byEmail: string;
}): Promise<void> {
    const reason = params.reason.trim();
    if (!params.orgId || !params.untilIso || !reason) return;
    await updateDoc(doc(db, 'organizations', params.orgId), {
        overrideUntil: params.untilIso,
        overrideReason: reason,
        overrideBy: params.byEmail,
        overrideAt: new Date().toISOString(),
        suspended: false,
        suspendedReason: '',
    });
}

/** Withdraw an override, leaving the trial and payment dates to decide. */
export async function clearOverride(orgId: string): Promise<void> {
    if (!orgId) return;
    await updateDoc(doc(db, 'organizations', orgId), {
        overrideUntil: '',
        overrideReason: '',
    });
}

/**
 * Stop an organisation outright.
 *
 * Beats a paid term in `resolveSubscription`, deliberately: a suspension is
 * somebody deciding, and a payment that has not been refunded yet must not
 * quietly undo it.
 */
export async function setSuspended(params: {
    orgId: string;
    suspended: boolean;
    reason?: string;
}): Promise<void> {
    if (!params.orgId) return;
    await updateDoc(doc(db, 'organizations', params.orgId), {
        suspended: params.suspended,
        suspendedReason: params.suspended ? (params.reason ?? '').trim() : '',
    });
}

/** Change what happens when the trial runs out, without moving the dates. */
export async function setTrialEndBehaviour(params: {
    orgId: string;
    behaviour: TrialEndBehaviour;
    graceDays?: number;
}): Promise<void> {
    if (!params.orgId) return;
    await updateDoc(doc(db, 'organizations', params.orgId), {
        trialEndBehaviour: params.behaviour,
        ...(Number.isFinite(params.graceDays) ? { graceDays: params.graceDays } : {}),
    });
}

// ---------------------------------------------------------------------------
// What the tenant can do: ask
// ---------------------------------------------------------------------------

export interface SubscriptionRequest {
    id?: string;
    orgId: string;
    /** What they are asking for. */
    kind: 'activate' | 'extend-trial' | 'add-seats';
    /** Seats wanted, for `add-seats`. */
    seats?: number;
    /** A provider reference or transfer note the platform can check against. */
    reference: string;
    note: string;
    requestedByUid: string;
    requestedByEmail: string;
    createdAt?: unknown;
    status: 'open' | 'actioned' | 'declined';
}

/**
 * Ask the platform to activate, extend or add seats.
 *
 * The tenant's only write in this whole feature, and it grants nothing: a
 * request document is a message, and a super admin confirming a payment against
 * the provider's own dashboard is what turns it into a subscription. Anything a
 * browser says about money arriving is a claim by the party who owes it.
 *
 * `status` is pinned to `open` here and in the rules, so a request cannot be
 * created pre-actioned.
 */
export async function requestActivation(params: {
    kind: SubscriptionRequest['kind'];
    reference?: string;
    note?: string;
    seats?: number;
    uid: string;
    email: string;
}): Promise<void> {
    const orgId = getActiveOrgKey();
    if (!orgId || !params.uid) return;
    await addDoc(collection(db, SUBSCRIPTION_REQUESTS), {
        orgId,
        kind: params.kind,
        ...(Number.isFinite(params.seats) ? { seats: params.seats } : {}),
        reference: (params.reference ?? '').trim().slice(0, 200),
        note: (params.note ?? '').trim().slice(0, 1000),
        requestedByUid: params.uid,
        requestedByEmail: params.email,
        createdAt: serverTimestamp(),
        status: 'open',
    });
}

/** Every open request across the platform, for a super admin to work through. */
export function useOpenSubscriptionRequests(enabled: boolean): SubscriptionRequest[] {
    const [requests, setRequests] = useState<SubscriptionRequest[]>([]);

    useEffect(() => {
        if (!enabled) return;
        // Ordered newest first, and filtered on status so the list is the queue
        // rather than the archive — needs the composite index in
        // firestore.indexes.json.
        const unsubscribe = onSnapshot(
            query(
                collection(db, SUBSCRIPTION_REQUESTS),
                where('status', '==', 'open'),
                orderBy('createdAt', 'desc'),
            ),
            (snapshot) => {
                setRequests(
                    snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as SubscriptionRequest) })),
                );
            },
            () => setRequests([]),
        );
        return unsubscribe;
    }, [enabled]);

    return requests;
}

/** Close a request once it has been acted on, or declined. */
export async function closeSubscriptionRequest(
    id: string,
    status: 'actioned' | 'declined',
): Promise<void> {
    if (!id) return;
    await updateDoc(doc(db, SUBSCRIPTION_REQUESTS, id), { status });
}

/**
 * True when this workspace is locked and an administrative write should be
 * refused.
 *
 * The convenience the gate is actually applied through. Deliberately a *client*
 * check — see the note at the top of data/subscriptionRules.ts: the rules
 * enforce who owns the subscription record, not whether the app runs, because
 * an HR system that denies reads over an invoice takes a company's attendance
 * history away from it.
 *
 * So this hides and disables; it does not secure. That is the correct trade for
 * a billing gate and the wrong one for anything else, which is why it lives
 * beside a comment saying so rather than looking like an authorization hook.
 */
export function useWorkspaceLocked(): boolean {
    return useSubscription().status.locked;
}
