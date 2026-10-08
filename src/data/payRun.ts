/**
 * Who a payroll run pays — pure, so `npm run test:unit` reaches it.
 *
 * A run for a month pays the people on roll for that month: joined by its
 * last day, and not resigned. The Payroll page asks this before it previews a
 * run, and refuses to confirm one that would pay nobody.
 */
import type { Employee } from '@/types';

/** The last calendar day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function lastDayOf(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
}

/**
 * Records this app used to invent for an administrator with none of their own.
 *
 * Until the guided setup asked HR for their details, an HR or Admin account
 * with no employee record was given one on the spot — female, born
 * 15 May 1992, joined 1 January 2023, posted to "Headquarters", on a CTC of
 * ₹36 lakh — so the dashboard had somebody to punch in. None of it came from
 * anybody, and payroll paid it: in a twenty-person office it was a quarter of
 * the month's run.
 *
 * Nothing creates one any more. Those already stored are recognised by the
 * id the old code minted plus the two invented figures, so that the setup can
 * ask for the real details and payroll can refuse to pay the made-up ones. A
 * record somebody has since corrected no longer matches and is left alone.
 */
export function isInventedAdminRecord(
  employee: Pick<Employee, 'id' | 'dateOfBirth' | 'ctc'> | null | undefined,
): boolean {
  if (!employee) return false;
  return (
    /^emp-(hr|adm)-001-/.test(employee.id) &&
    employee.dateOfBirth === '1992-05-15' &&
    employee.ctc === 3600000
  );
}

/**
 * Who a run for `month` pays, and who it deliberately leaves out.
 *
 * On roll is `payeesFor`. Of those, a record this app invented for an
 * administrator is excluded and named rather than paid — its CTC is a figure
 * nobody entered — until somebody corrects it on the profile, at which point
 * it stops matching and is paid like anyone else.
 */
export function payRunRoll<T extends Pick<Employee, 'id' | 'status' | 'dateOfJoining' | 'dateOfBirth' | 'ctc' | 'lastWorkingDay'>>(
  employees: readonly T[],
  month: string,
): { payees: T[]; excluded: { employee: T; reason: string }[] } {
  const payees: T[] = [];
  const excluded: { employee: T; reason: string }[] = [];
  for (const employee of payeesFor(employees, month)) {
    if (isInventedAdminRecord(employee)) {
      excluded.push({
        employee,
        reason: 'Their date of birth and CTC were filled in automatically and never entered by anyone. Correct their profile and they will be paid.',
      });
    } else {
      payees.push(employee);
    }
  }
  return { payees, excluded };
}

/** The day of the month from which that month itself may be run. */
export const CURRENT_MONTH_RUNNABLE_FROM_DAY = 25;

/**
 * The months a run may be for, on `today` (`YYYY-MM-DD`): the five before
 * this one, and this one too once it is nearly over.
 *
 * It used to offer the current month from its first day, so October could be
 * confirmed on the 8th — full pay for three weeks nobody had worked yet, and a
 * cycle the page then refuses to run again. From the 25th a company can still
 * pay on the last working day; an absence after the run is charged to the next
 * month as arrears, which `lossOfPayArrears` already does. Further back than
 * six months is a correction, not a run.
 */
export function runnableMonths(today: string): string[] {
  const [year, mon, day] = today.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, mon - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  return day >= CURRENT_MONTH_RUNNABLE_FROM_DAY ? months : [...months.slice(1), previousMonth(months[5])];
}

function previousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon - 2, 1)).toISOString().slice(0, 7);
}

export function payeesFor<T extends Pick<Employee, 'status' | 'dateOfJoining' | 'lastWorkingDay'>>(employees: readonly T[], month: string): T[] {
  const end = lastDayOf(month);
  const start = `${month}-01`;
  return employees.filter((employee) => {
    if (employee.dateOfJoining && employee.dateOfJoining > end) return false;
    // A leaver is paid for their last month, to their last working day, and
    // for no month after it. Somebody marked Resigned before last working
    // days were recorded has no such day and is not paid, as before.
    if (employee.lastWorkingDay) return employee.lastWorkingDay >= start;
    return employee.status !== 'Resigned';
  });
}

export interface CarriedOverLossOfPay {
  readonly employeeId: string;
  /** The earlier, already-paid month the days belong to. */
  readonly fromMonth: string;
  /** Positive: days deducted now. Negative: days refunded. */
  readonly days: number;
  /** Positive is deducted from this run's pay; negative is paid back. */
  readonly amount: number;
}

/**
 * Every correction to an earlier month's loss of pay that a run is about to
 * make, one row per employee per month.
 *
 * `lossOfPayArrears` computes these onto each payslip, and they change what
 * somebody is paid — a leave approved after its month was paid, or an absence
 * regularised afterwards — for a reason that is not on this month's own
 * attendance. So a run lists them before it is confirmed, rather than leaving
 * HR to find them one payslip at a time. The first month they can appear is
 * the first run after a paid month whose payslip recorded `lopDays`.
 */
export function carriedOverLossOfPay(
  payslips: readonly { employeeId: string; lopArrears?: readonly { month: string; days: number; amount: number }[] }[],
): CarriedOverLossOfPay[] {
  return payslips
    .flatMap((p) => (p.lopArrears ?? [])
      .filter((a) => a.days !== 0)
      .map((a) => ({ employeeId: p.employeeId, fromMonth: a.month, days: a.days, amount: a.amount })))
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth) || a.employeeId.localeCompare(b.employeeId));
}
