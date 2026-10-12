/**
 * Decisions on somebody's own requests — what they are waiting to hear.
 *
 * An employee applied for leave, a manager approved it, and the employee was
 * told nothing: the bell only ever counted queues for approvers, and the
 * dashboard showed none of it. Every decision now carries `decidedAt` and
 * `decidedByName` (stamped by `updateLeaveRequestStatus`,
 * `updateExpenseClaimStatus` and `decideRegularization`), and this module
 * turns the viewer's own decided requests into updates.
 *
 * Derived from the records, never stored: the decision *is* the notification,
 * so it cannot disagree with the request it is about. What is stored is only
 * which ones this person has already opened — a per-person, per-browser
 * convenience (src/lib/seenUpdates.ts), never a fact about the request.
 */
/*
 * Pure: imports nothing, so tests/unit/myUpdates.test.ts can check it. The
 * store-reading wrapper is getMyUpdates in src/data/myUpdates.ts.
 */

export type UpdateKind = 'leave' | 'expense' | 'regularization';

export interface MyUpdate {
  /** Changes when the outcome changes, so a re-decided request is new again. */
  id: string;
  kind: UpdateKind;
  /** The notification preference that governs it (data/notificationPreferences.ts). */
  preferenceId: 'n2' | 'n15' | 'n16';
  outcome: 'Approved' | 'Rejected' | 'Reimbursed';
  title: string;
  detail: string;
  decidedAt: string;
  decidedByName?: string;
  path: string;
}

/** Decisions older than this are history, not news. */
export const UPDATE_WINDOW_DAYS = 30;

interface Decided { decidedAt?: string; decidedByName?: string }
export interface LeaveLike extends Decided {
  id: string; employeeId: string; type: string; startDate: string; endDate: string;
  days: number; status: string; lossOfPayDays?: number;
}
export interface ExpenseLike extends Decided {
  id: string; employeeId: string; title: string; amount: number; status: string;
}
export interface RegularizationLike extends Decided {
  id: string; employeeId: string; date: string; status: string; requestedStatus: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-10-28` → `28 Oct`. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return m && d ? `${d} ${MONTHS[Number(m) - 1] ?? ''}`.trim() : iso;
}

function within(iso: string, now: Date): boolean {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t <= now.getTime() + 60_000 && now.getTime() - t <= UPDATE_WINDOW_DAYS * 86_400_000;
}

function range(start: string, end: string): string {
  return start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

export function buildMyUpdates(
  employeeId: string | null | undefined,
  records: { leave: LeaveLike[]; expenses: ExpenseLike[]; regularizations: RegularizationLike[] },
  now: Date = new Date(),
): MyUpdate[] {
  if (!employeeId) return [];
  const updates: MyUpdate[] = [];

  for (const r of records.leave) {
    if (r.employeeId !== employeeId || !r.decidedAt || !within(r.decidedAt, now)) continue;
    if (r.status !== 'Approved' && r.status !== 'Rejected') continue;
    updates.push({
      id: `leave:${r.id}:${r.status}:${r.decidedAt}`,
      kind: 'leave',
      preferenceId: 'n2',
      outcome: r.status,
      title: `Leave ${r.status === 'Approved' ? 'approved' : 'rejected'}`,
      detail: `${r.type} · ${range(r.startDate, r.endDate)} · ${r.days} day${r.days === 1 ? '' : 's'}`
        + (r.status === 'Approved' && r.lossOfPayDays ? ` (${r.lossOfPayDays} unpaid)` : ''),
      decidedAt: r.decidedAt,
      decidedByName: r.decidedByName,
      path: '/leave',
    });
  }

  for (const c of records.expenses) {
    if (c.employeeId !== employeeId || !c.decidedAt || !within(c.decidedAt, now)) continue;
    if (c.status !== 'Approved' && c.status !== 'Rejected' && c.status !== 'Reimbursed') continue;
    updates.push({
      id: `expense:${c.id}:${c.status}:${c.decidedAt}`,
      kind: 'expense',
      preferenceId: 'n15',
      outcome: c.status,
      title: `Expense claim ${c.status.toLowerCase()}`,
      detail: `${c.title} · ₹${c.amount.toLocaleString('en-IN')}`,
      decidedAt: c.decidedAt,
      decidedByName: c.decidedByName,
      path: '/expenses',
    });
  }

  for (const g of records.regularizations) {
    if (g.employeeId !== employeeId || !g.decidedAt || !within(g.decidedAt, now)) continue;
    if (g.status !== 'Approved' && g.status !== 'Rejected') continue;
    // An entry the app flagged and nobody raised is not somebody's request.
    if (!g.requestedStatus) continue;
    updates.push({
      id: `regularization:${g.id}:${g.status}:${g.decidedAt}`,
      kind: 'regularization',
      preferenceId: 'n16',
      outcome: g.status,
      title: `Regularization ${g.status === 'Approved' ? 'approved' : 'rejected'}`,
      detail: `${shortDate(g.date)} as ${g.requestedStatus}`,
      decidedAt: g.decidedAt,
      decidedByName: g.decidedByName,
      path: '/my-attendance',
    });
  }

  return updates.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
}
