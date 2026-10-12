import { useState } from 'react';
import { Landmark, Lock } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Modal } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  BankDetailsError,
  canEditBankDetails,
  canReviewBankDetails,
  isOwnRecord,
  reviewBankDetails,
  saveBankDetails,
  useBankDetails,
  type BankDetails,
} from '@/lib/bankDetails';
import { maskAccountNumber, validateBankDetails, type BankDetailsInput } from '@/data/bankDetailsRules';
import { formatDate } from '@/lib/utils';

const EMPTY: BankDetailsInput = {
  accountHolderName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  ifsc: '',
  bankName: '',
};

function statusTone(status: BankDetails['status']): 'green' | 'amber' | 'red' {
  if (status === 'Verified') return 'green';
  if (status === 'Rejected') return 'red';
  return 'amber';
}

/**
 * The account salary is paid into, on the employee's profile.
 *
 * The employee enters it, HR verifies it, and from then on only HR changes
 * it. Shown to the employee themselves and to HR/Admin; anybody else gets
 * nothing, which is also all the rules would give them.
 */
export function BankDetailsCard({ employeeId }: { employeeId: string }) {
  const { profile } = useAuth();
  const reviewer = canReviewBankDetails(profile);
  const own = isOwnRecord(profile, employeeId);
  const { details, loading, error } = useBankDetails(profile, reviewer || own ? employeeId : null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BankDetailsInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof BankDetailsInput, string>>>({});
  const [saveError, setSaveError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!reviewer && !own) return null;

  const editable = canEditBankDetails(profile, employeeId, details);

  function openForm() {
    setForm(details
      ? {
          accountHolderName: details.accountHolderName,
          accountNumber: details.accountNumber,
          confirmAccountNumber: '',
          ifsc: details.ifsc,
          bankName: details.bankName ?? '',
        }
      : EMPTY);
    setFieldErrors({});
    setSaveError('');
    setFormOpen(true);
  }

  async function submit() {
    const result = validateBankDetails(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    setBusy(true);
    try {
      await saveBankDetails(profile, employeeId, result.value, details);
      setFormOpen(false);
    } catch (err) {
      setSaveError(
        err instanceof BankDetailsError
          ? err.message
          : 'Those details were not saved. If HR has already verified them, contact HR to change them.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function review(status: 'Verified' | 'Rejected') {
    if (!details) return;
    setBusy(true);
    try {
      await reviewBankDetails(profile, details, status, status === 'Rejected' ? rejectNote : undefined);
      setRejecting(false);
      setRejectNote('');
    } catch {
      setSaveError('That review was not saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof BankDetailsInput, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <label className="label" htmlFor={`bank-${key}`}>{label}</label>
      <input
        id={`bank-${key}`}
        className="input"
        value={form[key]}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          setFieldErrors({ ...fieldErrors, [key]: undefined });
        }}
        {...props}
      />
      {fieldErrors[key] && <p className="text-xs font-medium text-rose-600">{fieldErrors[key]}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Bank Account"
        subtitle="The account salary is paid into. Visible only to this employee and HR."
        action={details ? <Badge tone={statusTone(details.status)} dot>{details.status}</Badge> : undefined}
      />

      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          Bank details could not be loaded. Your account may not have access to them.
        </p>
      ) : !details ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-500">
            {own
              ? 'Add the account your salary should be paid into. HR verifies it before payroll uses it.'
              : 'This employee has not added a bank account yet.'}
          </p>
          {editable && (
            <Button size="sm" icon={<Landmark size={14} />} onClick={openForm}>
              Add bank details
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="label">Account holder</dt>
              <dd className="text-ink-900">{details.accountHolderName}</dd>
            </div>
            <div>
              <dt className="label">Account number</dt>
              {/* HR sees the full number to check it against the proof; the
                  employee already knows theirs. */}
              <dd className="font-mono text-ink-900">
                {reviewer ? details.accountNumber : maskAccountNumber(details.accountNumber)}
              </dd>
            </div>
            <div>
              <dt className="label">IFSC</dt>
              <dd className="font-mono text-ink-900">{details.ifsc}</dd>
            </div>
            <div>
              <dt className="label">Bank</dt>
              <dd className="text-ink-900">{details.bankName || '—'}</dd>
            </div>
          </dl>

          {details.status === 'Pending' && (
            <p className="text-xs text-ink-500">
              Submitted {formatDate(details.submittedAt.slice(0, 10))}. Waiting for HR to verify.
            </p>
          )}
          {details.status === 'Rejected' && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              HR could not verify these details{details.reviewNote ? `: ${details.reviewNote}` : '.'}
              {own ? ' Please correct them and submit again.' : ''}
            </p>
          )}
          {details.status === 'Verified' && (
            <p className="flex items-start gap-2 text-xs text-ink-600">
              <Lock size={14} className="mt-0.5 shrink-0" />
              <span>
                Verified by HR on {formatDate((details.reviewedAt ?? details.submittedAt).slice(0, 10))}.
                {!reviewer && ' To change these details, contact HR.'}
              </span>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {reviewer && details.status === 'Pending' && !rejecting && (
              <>
                <Button size="sm" disabled={busy} onClick={() => void review('Verified')}>Verify</Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
              </>
            )}
            {editable && (
              <Button size="sm" variant="secondary" onClick={openForm}>
                {details.status === 'Verified' ? 'Correct details' : 'Edit details'}
              </Button>
            )}
          </div>

          {rejecting && (
            <div className="space-y-2">
              <label className="label" htmlFor="bank-reject-note">Reason (shown to the employee)</label>
              <input
                id="bank-reject-note"
                className="input"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Name does not match the cancelled cheque"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void review('Rejected')}>Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {saveError && !formOpen && <p className="mt-3 text-sm font-medium text-rose-600">{saveError}</p>}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Bank account details"
        subtitle={reviewer
          ? 'Saved as verified by you.'
          : 'HR verifies these before payroll uses them. Once verified, only HR can change them.'}
        footer={(
          <>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={busy} onClick={() => void submit()}>
              {reviewer ? 'Save' : 'Submit for verification'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {field('accountHolderName', 'Account holder name', { autoComplete: 'name' })}
          {field('accountNumber', 'Account number', { inputMode: 'numeric', autoComplete: 'off' })}
          {field('confirmAccountNumber', 'Confirm account number', { inputMode: 'numeric', autoComplete: 'off', onPaste: (e) => e.preventDefault() })}
          {field('ifsc', 'IFSC code', { autoCapitalize: 'characters', placeholder: 'HDFC0001234' })}
          {field('bankName', 'Bank name (optional)')}
          {saveError && <p className="text-sm font-medium text-rose-600">{saveError}</p>}
        </div>
      </Modal>
    </Card>
  );
}
