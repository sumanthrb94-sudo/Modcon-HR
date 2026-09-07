import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Circle, KeyRound, Rocket } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployeeRecord } from '@/lib/dataScope';
import { getEmployeeDirectory } from '@/data/employees';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useAccessControlRevision } from '@/lib/useAccessControlRevision';
import { orgScopedKey } from '@/lib/orgScope';
import {
  getEmployeeTasks,
  getOrganisationTasks,
  outstandingCount,
  type GettingStartedTask,
} from '@/data/gettingStarted';

/**
 * The panel that answers "what now?" — and, for an administrator, "how do my
 * people get in?".
 *
 * ## Why an overlay rather than a page
 *
 * A setup page is a place you have to already know about. The thing this fixes
 * is somebody signing in to a working HR system and having no idea which of a
 * dozen sidebar entries is the one that matters first — so it opens itself,
 * once, on the first visit that has outstanding work, and afterwards lives
 * behind a button that carries the count.
 *
 * ## What it will not do
 *
 * It does not block. Every task links to the page that satisfies it and the
 * overlay closes; nothing is gated behind finishing the list, because a
 * company that wants to look at the directory before declaring its holiday
 * calendar is not doing anything wrong. And it does not congratulate — when
 * everything is done it says so in one line and gets out of the way.
 *
 * The ticks are derived (see data/gettingStarted.ts), so this component holds
 * no state about progress at all. The only thing it remembers is whether it
 * has opened itself before, which is a per-browser convenience and belongs in
 * localStorage.
 */

const SEEN_KEY = 'modcon.hr.gettingStarted.seen';

function hasOpenedBefore(uid: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(orgScopedKey(`${SEEN_KEY}.${uid}`)) === '1';
  } catch {
    // A browser refusing storage should not mean this reopens on every page
    // load for the rest of somebody's day.
    return true;
  }
}

function rememberOpened(uid: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(orgScopedKey(`${SEEN_KEY}.${uid}`), '1');
  } catch {
    // ignore
  }
}

function TaskRow({ task, onGo }: { task: GettingStartedTask; onGo: (href: string) => void }) {
  return (
    <li className="flex items-start gap-3 border-b border-ink-200 py-3 last:border-b-0">
      <span className="mt-0.5 shrink-0">
        {task.done ? (
          <Check size={16} className="text-emerald-600" />
        ) : (
          <Circle size={16} className="text-ink-300" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={task.done ? 'text-sm font-medium text-ink-400 line-through' : 'text-sm font-semibold text-ink-900'}>
          {task.title}
          {task.optional && !task.done && (
            <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-[0.08em] text-ink-400">
              optional
            </span>
          )}
        </p>
        {!task.done && <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{task.why}</p>}
      </div>
      {!task.done && (
        <button
          type="button"
          onClick={() => onGo(task.href)}
          className="shrink-0 self-center text-xs font-semibold text-brand-700 hover:underline"
        >
          Open <ArrowRight size={12} className="inline" />
        </button>
      )}
    </li>
  );
}

export function GettingStarted() {
  const { profile, isAdmin, isHR, linkedEmployeeId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const directoryRevision = useEmployeeDirectoryRevision();
  // The org's configuration is what every task reads, and it is hydrated from
  // Firestore after sign-in — so the list has to recompute when it lands, or
  // an administrator opens this to a screen of unticked boxes for work they
  // did last week.
  const settingsRevision = useAccessControlRevision();
  const [open, setOpen] = useState(false);

  const isOrgAdmin = isAdmin || isHR;
  const role = resolveAppRole(profile);

  const tasks = useMemo(() => {
    if (isOrgAdmin) return getOrganisationTasks();
    const self = getCurrentEmployeeRecord(profile, getEmployeeDirectory());
    return getEmployeeTasks(self, linkedEmployeeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrgAdmin, profile, linkedEmployeeId, directoryRevision, settingsRevision, open]);

  const remaining = outstandingCount(tasks);

  /**
   * Opens itself once, on the page somebody *arrives* at — and nowhere else.
   *
   * It used to open on whatever page the app happened to be showing, which
   * made it a modal that interrupts a deliberate navigation: somebody following
   * a link to Attendance got a checklist over the top of it, and their first
   * click went into the backdrop instead of the button they were aiming at.
   * The E2E suite found this the honest way, by having its first click
   * swallowed.
   *
   * The home route is where a sign-in lands, so greeting people there is the
   * whole of what this was for. Anywhere else it waits behind its launcher.
   */
  useEffect(() => {
    const uid = profile?.uid;
    if (!uid || remaining === 0) return;
    if (location.pathname !== '/') return;
    if (hasOpenedBefore(uid)) return;
    rememberOpened(uid);
    setOpen(true);
  }, [profile?.uid, remaining, location.pathname]);

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  if (!profile) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Getting started"
        className="relative inline-flex items-center gap-1.5 border border-ink-300 px-2 py-1 text-xs font-semibold text-ink-800 hover:bg-ink-100"
      >
        <Rocket size={14} className="text-brand-600" />
        <span className="hidden lg:inline">Getting started</span>
        {remaining > 0 && (
          <span className="ml-0.5 bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-ink-50 tabular-nums">
            {remaining}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isOrgAdmin ? 'Setting up your organisation' : 'Getting started'}
        subtitle={
          remaining === 0
            ? 'Everything that matters is set up. This stays here if you need it.'
            : isOrgAdmin
              ? 'Each of these changes what the app actually does. They can be done in any order.'
              : 'A short list, and then the app is yours.'
        }
        footer={<Button variant="primary" onClick={() => setOpen(false)}>Close</Button>}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Badge tone={remaining === 0 ? 'green' : 'amber'} dot>
              {remaining === 0 ? 'Set up' : `${remaining} to do`}
            </Badge>
            <span className="text-ink-500">
              {tasks.filter((task) => task.done).length} of {tasks.length} done
            </span>
          </div>

          <ul>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} onGo={go} />
            ))}
          </ul>

          {isOrgAdmin && (
            /* The question every administrator asks on day one, answered where
               they are rather than in documentation nobody opens. */
            <div className="border border-ink-300 bg-ink-100 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <KeyRound size={14} className="text-brand-600" /> How your team gets in
              </p>
              <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-700">
                <li>
                  <strong>1.</strong> Add the person on <em>Employees → Add Employee</em>, with the
                  work email they will sign in with.
                </li>
                <li>
                  <strong>2.</strong> Open their profile and press <em>Create login</em>. Pick their
                  role — Employee is self-service only, Manager adds their team&rsquo;s approvals, HR
                  Manager administers this organisation.
                </li>
                <li>
                  <strong>3.</strong> They are emailed a link to set their own password. Nothing has
                  to be passed on by hand, and you never see their password.
                </li>
              </ol>
              <p className="mt-2 text-xs text-ink-600">
                A temporary password is shown as a fallback in case the email does not arrive — paste
                it rather than typing it. If it is lost, use <em>Create login</em> again rather than
                creating a second account; it will offer to send a fresh link.
              </p>
            </div>
          )}

          {!isOrgAdmin && role === 'Employee' && (
            <p className="text-xs leading-relaxed text-ink-500">
              Your own pages are <em>My Attendance</em> for check-in, <em>Leave</em> for a request
              and your balance, and <em>Finance</em> for payslips. The Board is the company&rsquo;s
              noticeboard — birthdays and anniversaries appear there.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
