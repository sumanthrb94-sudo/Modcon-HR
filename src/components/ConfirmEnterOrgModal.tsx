import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { logAuditEvent } from '@/lib/auditLog';
import { switchSuperAdminOrg } from '@/lib/orgScope';

export interface EnterOrgTarget {
    id: string;
    name: string;
}

interface ConfirmEnterOrgModalProps {
    /** The organization awaiting confirmation, or `null` to render nothing. */
    target: EnterOrgTarget | null;
    onClose: () => void;
}

/**
 * Confirms before a super admin steps into a tenant's data.
 *
 * See "A super admin belongs to no organisation" in CLAUDE.md. Entering an
 * organization is the single most consequential act available on this
 * platform — from that click the whole tenant app renders for an account
 * that belongs to no tenant, with full HR-administrator access to that
 * company's directory, payroll and settings. It used to fire straight off a
 * button or a dropdown selection with nothing in between; this is the "in
 * between", shared by every entry point (`src/pages/organizations/index.tsx`,
 * the Topbar's organisation selector) so there is exactly one place this
 * confirmation is written, not one per caller that could drift apart.
 *
 * ## The audit write happens first, and is awaited
 *
 * `switchSuperAdminOrg` ends in `window.location.reload()`. A reload starts a
 * fresh page with an empty mutation queue, so a Firestore write that has not
 * yet been acknowledged when the reload fires is simply lost — the entry
 * this dialog exists to guarantee would silently not exist. So the audit
 * write is `await`ed *before* `switchSuperAdminOrg` is ever called.
 *
 * If that write fails — a permission error, an offline client, a rules
 * regression — the organization is **not** entered. An unaudited entry is
 * exactly the gap this dialog closes, so failing open here (entering anyway
 * and hoping the write lands) would defeat the whole feature. The failure is
 * shown in the dialog and the super admin can retry or cancel.
 */
export function ConfirmEnterOrgModal({ target, onClose }: ConfirmEnterOrgModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    function handleClose() {
        if (submitting) return;
        setError('');
        onClose();
    }

    async function confirm() {
        if (!target) return;
        setSubmitting(true);
        setError('');
        try {
            await logAuditEvent({
                action: 'super_admin.enter_org',
                orgId: target.id,
                orgName: target.name,
            });
        } catch (err) {
            setSubmitting(false);
            setError(
                `This was not recorded in the audit log, so the organization was not entered: ${(err as Error)?.message ?? 'unknown error'}. Try again, or check your connection.`,
            );
            return;
        }
        // switchSuperAdminOrg reloads the page on success; nothing after this
        // call runs, so there is no `finally` resetting `submitting`.
        switchSuperAdminOrg(target.id);
    }

    return (
        <Modal
            open={Boolean(target)}
            onClose={handleClose}
            title="Enter this organization?"
            subtitle={target?.name}
            footer={
                <>
                    <Button variant="secondary" onClick={handleClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => void confirm()} disabled={submitting}>
                        {submitting ? 'Entering…' : 'Enter organization'}
                    </Button>
                </>
            }
        >
            <div className="flex gap-3">
                <ShieldAlert size={20} className="mt-0.5 shrink-0 text-brand-600" />
                <div className="space-y-2 text-sm text-ink-700">
                    <p>
                        You are about to enter{' '}
                        <span className="font-semibold text-ink-900">{target?.name}</span> as its HR
                        administrator. From that moment the whole HR app renders this organization's
                        directory, attendance, payroll and settings as though you worked there — full
                        access, not a read-only look.
                    </p>
                    <p>This is recorded in the platform's audit log against your account, with the time.</p>
                </div>
            </div>
            {error && <p className="mt-3 text-sm font-medium text-brand-700">{error}</p>}
        </Modal>
    );
}
