import { collection, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { Card, CardHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';

interface AuditRow {
    id: string;
    actorEmail?: string;
    action: string;
    orgId: string;
    orgName?: string;
    at: Date | null;
}

const ACTION_LABELS: Record<string, string> = {
    'super_admin.enter_org': 'Platform super admin entered the organisation',
};

/**
 * Who administered this organisation, and when — read-only.
 *
 * Shown to the Super Admin (every organisation) and to an organisation's
 * Administrator (their own organisation only), and to nobody else: the product
 * owner restricted it to those two roles on 2026-09-23. `firestore.rules`
 * enforces the same thing, so hiding the panel is presentation and the server
 * is the boundary. An Administrator's query filters on their own orgId because
 * the rules evaluate a list against every entry it returns.
 */
export function AuditLogPanel() {
    const { profile, isAdmin, isSuperAdmin } = useAuth();
    const orgId = profile?.orgId ?? null;
    const canRead = isSuperAdmin || (isAdmin && Boolean(orgId));
    const [rows, setRows] = useState<AuditRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!canRead) return;
        const source = isSuperAdmin
            ? query(collection(db, 'audit_logs'), orderBy('at', 'desc'), limit(50))
            : query(collection(db, 'audit_logs'), where('orgId', '==', orgId));
        return onSnapshot(
            source,
            (snap) => {
                const next = snap.docs.map((d) => {
                    const data = d.data() as Omit<AuditRow, 'id' | 'at'> & { at?: Timestamp };
                    return { ...data, id: d.id, at: data.at ? data.at.toDate() : null };
                });
                // Sorted here for the Administrator's query, which filters on orgId
                // rather than ordering, so it needs no composite index.
                next.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
                setRows(next.slice(0, 50));
                setError(null);
            },
            () => setError('The audit log could not be loaded.'),
        );
    }, [canRead, isSuperAdmin, orgId]);

    if (!canRead) return null;

    return (
        <Card>
            <CardHeader
                title="Audit log"
                subtitle={isSuperAdmin
                    ? 'Every platform action on any organisation, newest first'
                    : 'Every time the platform administered this organisation, newest first'}
            />
            {error ? (
                <p className="text-sm text-ink-600">{error}</p>
            ) : rows === null ? (
                <p className="text-sm text-ink-500">Loading…</p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-ink-500">Nothing recorded yet.</p>
            ) : (
                <ul className="divide-y divide-ink-100" data-testid="audit-log">
                    {rows.map((row) => (
                        <li key={row.id} className="py-2.5 text-sm break-words">
                            <p className="text-ink-900">{ACTION_LABELS[row.action] ?? row.action}</p>
                            <p className="text-xs text-ink-500">
                                {row.actorEmail ?? 'Unknown actor'}
                                {isSuperAdmin ? ` · ${row.orgName ?? row.orgId}` : ''}
                                {row.at ? ` · ${row.at.toLocaleString('en-IN')}` : ''}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
