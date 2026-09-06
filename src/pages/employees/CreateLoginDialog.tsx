import { useState } from 'react';
import { Check, Copy, KeyRound, Mail, TriangleAlert } from 'lucide-react';
import { Button, Modal, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  INVITABLE_ROLES,
  friendlyInviteError,
  inviteAccount,
  sendSetPasswordEmail,
  type InviteAccountResult,
} from '@/lib/accountInvites';
import { linkAccountForEmployee } from '@/data/employeeLinks';
import type { Employee } from '@/types';
import type { UserRole } from '@/lib/auth';

/**
 * Give an employee a way to sign in — from their own record, where HR is
 * already standing.
 *
 * ## Why this is here and not only on the Admin dashboard
 *
 * Creating the account was possible before this (Admin → Create account), but
 * only as a separate errand: HR hired somebody on the Employees page, then went
 * to another page and retyped their name and address to make a login. Nothing
 * on the employee's own record said whether they had one, and nothing offered
 * to make it. A step nobody is prompted to take is a step that gets skipped,
 * and an employee with no account is invisible to themselves — no attendance,
 * no payslip, no leave.
 *
 * ## The password does not travel
 *
 * The account is created with a random password nobody ever sees, and Firebase
 * emails the employee a link to set their own. That is the whole point: the
 * failure this replaces is a human carrying fourteen characters including
 * `!@#$%` from one screen to another, which has failed twice on the
 * organisation-provisioning path and produces a sign-in error
 * (`auth/invalid-credential`) indistinguishable from "no such account".
 *
 * The temporary password is still shown, because email is not reliable and a
 * misspelled address or an aggressive spam filter must not leave somebody with
 * no way in at all. It is shown once and never stored.
 */
export function CreateLoginDialog({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [role, setRole] = useState<UserRole>('employee');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InviteAccountResult | null>(null);
  const [linkedExisting, setLinkedExisting] = useState('');
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  function copy(field: 'email' | 'password') {
    if (!result) return;
    void navigator.clipboard.writeText(field === 'email' ? result.email : result.tempPassword);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  function close() {
    setResult(null);
    setError('');
    setLinkedExisting('');
    setRole('employee');
    onClose();
  }

  async function create() {
    if (!profile?.uid) return;
    setWorking(true);
    setError('');
    setLinkedExisting('');
    try {
      setResult(
        await inviteAccount(
          {
            name: employee.fullName,
            email: employee.email ?? '',
            role,
            // The inviter's own organisation, never chosen here — the same
            // rule the Admin dashboard's form follows.
            orgId: profile.orgId ?? '',
          },
          profile.uid,
        ),
      );
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        // Not a failure worth stopping on: the account they need already
        // exists, and what is almost certainly missing is the link between it
        // and this record. Pointing it here is the useful thing to do, and it
        // is exactly what Add Employee does for an address that already has an
        // account.
        const outcome = await linkAccountForEmployee({
          employeeId: employee.id,
          email: employee.email ?? '',
          orgId: profile.orgId || undefined,
          linkedBy: profile.email ?? profile.uid,
        });
        setLinkedExisting(
          outcome.status === 'linked' || outcome.status === 'already-linked'
            ? `${employee.email} already has an account, and it is now pointed at this record. They sign in with the password they already have — use “Send a set-password link” if they have forgotten it.`
            : `${employee.email} already has an account, but it could not be linked to this record automatically (${outcome.status}). Use the identity backfill in Settings → Database.`,
        );
      } else {
        setError(friendlyInviteError(err));
      }
    } finally {
      setWorking(false);
    }
  }

  async function resend() {
    setError('');
    try {
      await sendSetPasswordEmail(employee.email ?? '');
      setLinkedExisting(`A set-password link has been emailed to ${employee.email}.`);
    } catch (err) {
      setError(friendlyInviteError(err));
    }
  }

  const noAddress = !employee.email?.trim();

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? 'Login created' : `Create a login for ${employee.firstName}`}
      subtitle={
        result
          ? 'They set their own password from the link — nothing here needs to be passed on by hand.'
          : 'An account for this employee, in this organisation, with the role you choose.'
      }
      size="sm"
      footer={
        result || linkedExisting ? (
          <Button variant="primary" onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={working}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={working || noAddress}>
              {working ? 'Creating…' : 'Create login'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 border border-ink-300 bg-ink-100 px-3 py-2.5">
            {result.emailSent ? (
              <Mail size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-600" />
            )}
            <span>
              {result.emailSent ? (
                <>
                  <strong>{result.email}</strong> has been emailed a link to set their password. It
                  comes from Firebase, so it may land in spam the first time.
                </>
              ) : (
                <>
                  The account exists, but the email could not be sent
                  {result.emailError ? ` (${result.emailError})` : ''}. Give them the temporary
                  password below instead.
                </>
              )}
            </span>
          </p>

          <div className="bg-ink-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-ink-400">Sign in with</p>
                <p className="font-mono text-ink-900 break-all">{result.email}</p>
              </div>
              <button type="button" onClick={() => copy('email')} className="btn-secondary shrink-0 gap-1.5 px-2 py-1 text-xs">
                {copied === 'email' ? <Check size={13} /> : <Copy size={13} />}
                {copied === 'email' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-ink-200 pt-2">
              <div className="min-w-0">
                <p className="text-xs text-ink-400">Temporary password — only needed if the email does not arrive</p>
                <p className="font-mono text-ink-900 break-all">{result.tempPassword}</p>
              </div>
              <button type="button" onClick={() => copy('password')} className="btn-secondary shrink-0 gap-1.5 px-2 py-1 text-xs">
                {copied === 'password' ? <Check size={13} /> : <Copy size={13} />}
                {copied === 'password' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-ink-500">
            Paste that password rather than typing it, and only if you have to. It is shown once and
            is not stored anywhere — if it is lost, use <strong>Send a set-password link</strong> on
            this record rather than creating the account again.
          </p>

          {result.linkedEmployeeId ? (
            <p className="text-xs text-ink-500">
              The account is pointed at this employee record, so they will see their own attendance,
              leave and payslips.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-xs text-amber-800">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                {result.linkNote ?? 'The account was not linked to this employee record.'} Until it
                is, they can sign in but will see none of their own records. Settings → Database has
                the backfill.
              </span>
            </p>
          )}
        </div>
      ) : linkedExisting ? (
        <p className="text-sm text-ink-700">{linkedExisting}</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-ink-400">Sign-in address</p>
            <p className="font-mono text-sm text-ink-900 break-all">
              {employee.email || <span className="text-brand-700">No work email on this record</span>}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="create-login-role">Role</label>
            <Select
              ariaLabel="Role"
              value={role}
              onChange={(value) => setRole(value as UserRole)}
              options={INVITABLE_ROLES.map((r) => ({
                value: r,
                label: r === 'hr' ? 'HR Manager' : r === 'manager' ? 'Manager' : 'Employee',
              }))}
            />
            <p className="mt-1.5 text-xs text-ink-500">
              Employee is self-service only. Manager adds their team&rsquo;s approvals. HR Manager
              administers this organisation.
            </p>
          </div>

          {noAddress && (
            <p className="text-xs text-brand-700">
              Add a work email to this employee&rsquo;s profile first — it is the address they sign
              in with.
            </p>
          )}

          {error && <p className="text-sm text-brand-700">{error}</p>}

          <p className="text-xs leading-relaxed text-ink-500">
            Firebase emails them a link to set their own password, so no password has to be passed
            on by hand. A temporary one is shown here as a fallback in case the mail does not arrive.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** The control that opens the dialog. Renders nothing for a non-administrator. */
export function CreateLoginButton({ employee, className }: { employee: Employee; className?: string }) {
  const { isAdmin, isHR } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isAdmin && !isHR) return null;

  return (
    <>
      <Button variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
        <KeyRound size={14} className="mr-1.5" /> Create login
      </Button>
      <CreateLoginDialog employee={employee} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
