import { ChevronLeft, IndianRupee } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, Card, CardHeader, PageHeader } from '@/components/ui';
import { EXPENSES_CHANGED_EVENT, getExpenseClaims, updateExpenseClaimStatus } from '@/data/expenses';
import { getEmployeeName } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import { getApprovableEmployeeIds } from '@/lib/dataScope';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { formatDate, formatINR } from '@/lib/utils';

/**
 * The expense claims this account may decide, and no others.
 *
 * This page used to list `getExpenseClaims()` with no filter and no idea who
 * was looking, so a manager was shown every claim in the organisation with
 * working Approve and Decline buttons on each. QA caught it live: Priya was
 * offered Meera's claim, and Meera reports to nobody and works in Finance.
 * It is the same gap the Leave queue had, in the other workflow.
 *
 * Two things were wrong and only one of them was the filter.
 *
 * The buttons called `setClaimStatuses`, which is React state — the decision
 * was never written to the store, never reached Firestore, and was gone on
 * reload. The row disappeared from the queue, which is exactly what a
 * successful approval looks like. `updateExpenseClaimStatus` is now the one
 * place a status changes, it checks authority itself, and it persists.
 *
 * And the list was read from a store the server no longer sends in full: an
 * employee's `expenseClaims` subscription is narrowed to what `readableBy`
 * allows. A stale or seeded cache can still hold rows the server would never
 * send, which is why the scope is applied HERE as well rather than trusted
 * from the query — the same reason dataScope.ts exists at all.
 */
export function ExpenseClaimsApprovalsPage() {
    const navigate = useNavigate();
    const { profile, linkedEmployeeId } = useAuth();
    const claimsRevision = useCollectionRevision(EXPENSES_CHANGED_EVENT);
    const directoryRevision = useEmployeeDirectoryRevision();
    const [refusal, setRefusal] = useState<string | null>(null);

    // Re-read through the store's getter on its change event: a colleague's
    // write arrives through the subscription, and a mount snapshot never sees
    // it. Never the exported seed array.
    const [claims, setClaims] = useState(() => getExpenseClaims());
    useEffect(() => { setClaims(getExpenseClaims()); }, [claimsRevision]);

    const approvableEmployeeIds = useMemo(
        () => getApprovableEmployeeIds(profile),
        [profile, directoryRevision, linkedEmployeeId],
    );

    const pendingClaims = useMemo(
        () => claims
            .filter((c) => c.status === 'Submitted' && approvableEmployeeIds.has(c.employeeId))
            .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime()),
        [claims, approvableEmployeeIds],
    );

    function decide(claimId: string, status: 'Approved' | 'Rejected') {
        const result = updateExpenseClaimStatus(claimId, status, { profile });
        setClaims(result.claims);
        // The buttons are already hidden where authority is absent, so reaching
        // a refusal means the UI and the rule disagree — and silence would look
        // exactly like a decision that landed.
        setRefusal(result.ok ? null : (result.reason ?? 'That decision was not allowed.'));
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Expense Claims"
                subtitle={`${pendingClaims.length} submitted claims awaiting your approval`}
                actions={
                    <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => navigate('/dashboard/pending-approvals')}>
                        Back to Pending Approvals
                    </Button>
                }
            />

            {refusal ? (
                <div role="status" className="border-2 border-brand-600 bg-brand-50 px-4 py-3 text-sm text-ink-900">
                    {refusal}
                </div>
            ) : null}

            <Card>
                <CardHeader title="Pending Expense Claims" subtitle="Only claims you may decide are listed" />
                {pendingClaims.length === 0 ? (
                    <p className="text-sm text-ink-400 text-center py-6">No pending expense claims</p>
                ) : (
                    <div className="space-y-3">
                        {pendingClaims.map((claim) => (
                            <div key={claim.id} className="rounded-xl border border-ink-100 bg-white p-4" data-testid="expense-approval-claim" data-employee-id={claim.employeeId}>
                                <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                        <IndianRupee size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-ink-900">{claim.title}</p>
                                            <Badge tone="amber">{claim.category}</Badge>
                                        </div>
                                        <p className="text-xs text-ink-500 mt-1">
                                            {getEmployeeName(claim.employeeId)} · Submitted {formatDate(claim.submittedOn)}
                                        </p>
                                        <p className="text-sm text-ink-700 mt-2">{claim.description}</p>
                                        <div className="flex items-center gap-2 mt-3">
                                            <Button size="sm" variant="secondary" onClick={() => decide(claim.id, 'Approved')}>
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-rose-600 hover:text-rose-700"
                                                onClick={() => decide(claim.id, 'Rejected')}
                                            >
                                                Decline
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold text-ink-900">{formatINR(claim.amount)}</p>
                                        <p className="text-xs text-ink-500">Expense date: {formatDate(claim.date)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
