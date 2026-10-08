import { useMemo, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { useAuth, type UserRole } from '@/lib/auth';
import { INVITABLE_ROLES } from '@/lib/accountInvites';
import { useEmployeeIdsWithLogin } from '@/data/employeeLinks';
import { createLoginForEmployee, type CreateLoginOutcome } from './CreateLoginDialog';
import type { Employee } from '@/types';

/**
 * Give logins to many people at once.
 *
 * In the office simulation HR imported twenty people and then opened twenty
 * profiles to press Create login on each. This lists everybody who can have a
 * login and does not yet, with a role per person, and creates them one after
 * another through `createLoginForEmployee` — the same function the button on
 * a profile uses, which stays for one person at a time.
 *
 * Who is left out, and why, is said rather than hidden: somebody with no email
 * cannot have a login at all, and somebody who already has one needs a reset,
 * not a second account.
 *
 * Accounts are created sequentially, not in parallel: each invite signs in on
 * a secondary Firebase app, and two at once would race on it.
 */

const ROLE_LABEL: Record<string, string> = { hr: 'HR Manager', manager: 'Manager', employee: 'Employee' };

type RowResult = CreateLoginOutcome | { status: 'pending' } | { status: 'working' };

export function BulkCreateLoginsDialog({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
}) {
  const { profile } = useAuth();
  const withLogin = useEmployeeIdsWithLogin(profile?.orgId ?? undefined);

  const { candidates, noEmail, already } = useMemo(() => {
    const active = employees.filter((e) => e.status !== 'Resigned');
    const managers = new Set(active.map((e) => e.reportingManagerId).filter(Boolean));
    const seen = new Set<string>();
    const candidates: { employee: Employee; defaultRole: UserRole }[] = [];
    const noEmail: Employee[] = [];
    const already: Employee[] = [];
    for (const employee of active) {
      const email = employee.email?.trim().toLowerCase();
      if (!email) { noEmail.push(employee); continue; }
      if (withLogin?.has(employee.id)) { already.push(employee); continue; }
      // One address, one account: a second person on it is offered nothing.
      if (seen.has(email)) { noEmail.push(employee); continue; }
      seen.add(email);
      candidates.push({ employee, defaultRole: managers.has(employee.id) ? 'manager' : 'employee' });
    }
    return { candidates, noEmail, already };
  }, [employees, withLogin]);

  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, RowResult>>({});
  // The batch as it was when Create was pressed. Each login that lands updates
  // the live "who has a login" read, which would drop that person out of
  // `candidates` — and their result with them — the moment it succeeded.
  const [batch, setBatch] = useState<{ employee: Employee; defaultRole: UserRole }[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const roleOf = (id: string, fallback: UserRole) => roles[id] ?? fallback;
  const isSelected = (id: string) => selected[id] ?? true;
  const chosen = candidates.filter((c) => isSelected(c.employee.id));
  const done = Object.values(results).filter((r) => r.status !== 'pending' && r.status !== 'working').length;
  const started = Object.keys(results).length > 0;

  async function createAll() {
    if (!profile?.uid || chosen.length === 0) return;
    setRunning(true);
    const queue = chosen.map((c) => ({ ...c, role: roleOf(c.employee.id, c.defaultRole) }));
    setBatch(chosen);
    setResults(Object.fromEntries(queue.map((c) => [c.employee.id, { status: 'pending' } as RowResult])));
    for (const item of queue) {
      setResults((r) => ({ ...r, [item.employee.id]: { status: 'working' } }));
      const outcome = await createLoginForEmployee(item.employee, item.role, profile);
      setResults((r) => ({ ...r, [item.employee.id]: outcome }));
    }
    setRunning(false);
  }

  function close() {
    if (running) return;
    setResults({});
    setBatch([]);
    setRoles({});
    setSelected({});
    onClose();
  }

  function copy(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create logins"
      subtitle={started
        ? `${done} of ${Object.keys(results).length} done. Each person is emailed a link to set their own password.`
        : 'Everybody below gets an account in this organisation and an email to set their own password.'}
      size="lg"
      footer={started && !running ? (
        <Button variant="primary" onClick={close}>Done</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={close} disabled={running}>Cancel</Button>
          <Button variant="primary" icon={<KeyRound size={14} />} onClick={() => void createAll()} disabled={running || chosen.length === 0 || withLogin === undefined}>
            {running ? `Creating ${done + 1} of ${Object.keys(results).length}…` : `Create ${chosen.length} login${chosen.length === 1 ? '' : 's'}`}
          </Button>
        </>
      )}
    >
      {withLogin === undefined ? (
        <p className="text-sm text-ink-500">Checking who already has a login…</p>
      ) : (
        <div className="space-y-4">
          {candidates.length === 0 && !started ? (
            <p className="text-sm text-ink-600">Everybody who can have a login already has one.</p>
          ) : (
            <>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-ink-600">{started ? batch.length : chosen.length} of {started ? batch.length : candidates.length} selected</span>
              <button
                type="button"
                className="font-semibold text-brand-700 disabled:text-ink-300"
                disabled={started}
                onClick={() => setSelected(Object.fromEntries(candidates.map((c) => [c.employee.id, true])))}
              >
                Select all
              </button>
              <button
                type="button"
                className="font-semibold text-brand-700 disabled:text-ink-300"
                disabled={started}
                onClick={() => setSelected(Object.fromEntries(candidates.map((c) => [c.employee.id, false])))}
              >
                Select none
              </button>
            </div>
            <div className="max-h-[50vh] overflow-auto border border-ink-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-100 text-xs text-ink-600">
                  <tr>
                    <th className="px-2 py-1.5"><span className="sr-only">Include</span></th>
                    <th className="px-2 py-1.5 font-semibold">Person</th>
                    <th className="px-2 py-1.5 font-semibold">Role</th>
                    <th className="px-2 py-1.5 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(started ? batch : candidates).map(({ employee, defaultRole }) => {
                    const result = results[employee.id];
                    return (
                      <tr key={employee.id} className="border-t border-ink-200 align-top" data-testid="bulk-login-row">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Include ${employee.fullName}`}
                            checked={isSelected(employee.id)}
                            disabled={started}
                            onChange={(e) => setSelected((s) => ({ ...s, [employee.id]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <p className="font-medium text-ink-900">{employee.fullName}</p>
                          <p className="text-xs text-ink-500 break-all">{employee.email}</p>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="input py-1 text-sm"
                            aria-label={`Role for ${employee.fullName}`}
                            value={roleOf(employee.id, defaultRole)}
                            disabled={started}
                            onChange={(e) => setRoles((r) => ({ ...r, [employee.id]: e.target.value as UserRole }))}
                          >
                            {INVITABLE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role] ?? role}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {!result || !isSelected(employee.id) ? null
                            : result.status === 'pending' ? <span className="text-ink-400">Waiting</span>
                            : result.status === 'working' ? <span className="text-ink-600">Creating…</span>
                            : result.status === 'created' ? (
                              <div>
                                <span className="text-emerald-700">
                                  {result.result.emailSent ? 'Created — link emailed' : 'Created — email did not send'}
                                </span>
                                {!result.result.emailSent && (
                                  <button
                                    type="button"
                                    className="mt-1 flex items-center gap-1 font-semibold text-brand-700"
                                    onClick={() => copy(employee.id, result.result.tempPassword)}
                                  >
                                    {copied === employee.id ? <Check size={12} /> : <Copy size={12} />} Copy temporary password
                                  </button>
                                )}
                              </div>
                            )
                            : result.status === 'existing' ? <span className="text-amber-800">{result.message}</span>
                            : <span className="text-rose-700">{result.message}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
          {(noEmail.length > 0 || already.length > 0) && (
            <div className="space-y-1 text-xs text-ink-600">
              {already.length > 0 && (
                <p><strong>{already.length}</strong> already {already.length === 1 ? 'has a login' : 'have logins'} — use Reset password on their profile if needed.</p>
              )}
              {noEmail.length > 0 && (
                <p>
                  <strong>{noEmail.length}</strong> cannot have a login without an email address of their own:{' '}
                  {noEmail.map((e) => e.fullName).join(', ')}. HR marks their attendance.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
