import { useMemo, useState } from 'react';
import { Download, LogOut, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Modal, Select } from '@/components/ui';
import { updateEmployeeInDirectory } from '@/data/employees';
import { getApplicableEntitlements } from '@/data/leaveEntitlements';
import { getLeaveRequests } from '@/data/leave';
import { buildPayslipComponents } from '@/data/payroll';
import { ctcOn, finalSettlement } from '@/data/payChanges';
import { getSalaryStructureFor, splitMonthlyGross } from '@/data/salaryStructure';
import { getStatutoryConfig, getTaxElectionFor, saveTaxElections, taxRegimeFor } from '@/data/statutory';
import { gratuity } from '@/data/statutoryRules';
import { getCompanyProfile } from '@/data/companyProfile';
import { useStatutoryRevision } from '@/lib/useStatutoryRevision';
import { todayIso } from '@/lib/today';
import { formatDate, formatINR } from '@/lib/utils';
import type { Employee, EmployeeStatus } from '@/types';

/**
 * The three things that change somebody's pay after they are hired: a
 * revision, a tax declaration, and leaving. HR and Admin only — the
 * Compensation tab shows these cards to nobody else.
 *
 * Each writes through the one place that already owned the data —
 * `updateEmployeeInDirectory` for the record, `saveTaxElections` for the
 * declaration — so payroll reads them the way it reads everything else.
 */

function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** "2026-10" → "October 2026", for sentences a person reads. */
function monthName(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Salary revisions
// ---------------------------------------------------------------------------

export function SalaryRevisionCard({ emp }: { emp: Employee }) {
  const [open, setOpen] = useState(false);
  const [ctc, setCtc] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const history = [...(emp.salaryHistory ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const today = todayIso();
  const inForce = ctcOn(today, emp.ctc, emp.salaryHistory);

  function save() {
    const next = Math.round(Number(ctc.replace(/[,\s]/g, '')));
    if (!Number.isFinite(next) || next <= 0) {
      setError('Enter the new annual CTC in rupees.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('Choose the date the new salary starts.');
      return;
    }
    if (emp.dateOfJoining && effectiveFrom < emp.dateOfJoining) {
      setError('A revision cannot start before they joined.');
      return;
    }
    const previousCtc = ctcOn(effectiveFrom, emp.ctc, emp.salaryHistory);
    if (next === previousCtc) {
      setError(`That is already their CTC on ${formatDate(effectiveFrom)}.`);
      return;
    }
    const revision = {
      effectiveFrom,
      ctc: next,
      previousCtc,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      recordedOn: today,
    };
    const salaryHistory = [...(emp.salaryHistory ?? []), revision];
    // `ctc` is the latest agreed figure — the one with the latest start date.
    const latest = [...salaryHistory].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
    updateEmployeeInDirectory({ ...emp, salaryHistory, ctc: latest?.ctc ?? next });
    setOpen(false);
    setCtc('');
    setReason('');
    setError(null);
  }

  const backdated = effectiveFrom < `${monthOf(today)}-01`;

  return (
    <Card>
      <CardHeader
        title="Salary history"
        subtitle="Every change to their CTC, and the date it took effect"
        action={(
          <Button size="sm" variant="secondary" icon={<TrendingUp size={14} />} onClick={() => setOpen(true)}>
            Revise salary
          </Button>
        )}
      />
      {inForce !== emp.ctc && (
        <p className="mb-3 text-sm text-ink-700">
          {formatINR(inForce)} a year today; {formatINR(emp.ctc)} from {formatDate(history[0]?.effectiveFrom ?? today)}.
        </p>
      )}
      {history.length === 0 ? (
        <p className="text-sm text-ink-500">No revisions yet. {formatINR(emp.ctc)} a year since they joined.</p>
      ) : (
        <ul className="divide-y divide-ink-100 text-sm" data-testid="salary-history">
          {history.map((revision) => (
            <li key={`${revision.effectiveFrom}-${revision.recordedOn}-${revision.ctc}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>
                <span className="font-semibold text-ink-900">{formatINR(revision.ctc)}</span>
                <span className="text-ink-500"> from {formatINR(revision.previousCtc)}</span>
                {revision.reason && <span className="block text-xs text-ink-500">{revision.reason}</span>}
              </span>
              <span className="text-xs text-ink-500">
                From {formatDate(revision.effectiveFrom)} · recorded {formatDate(revision.recordedOn)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Revise salary"
        subtitle={`${emp.fullName} · currently ${formatINR(inForce)} a year`}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save revision</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="revise-ctc" className="label">New annual CTC (₹)</label>
            <input id="revise-ctc" className="input" inputMode="numeric" value={ctc} onChange={(e) => setCtc(e.target.value)} placeholder="720000" />
          </div>
          <div>
            <label htmlFor="revise-from" className="label">Effective from</label>
            <input id="revise-from" type="date" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            {backdated && (
              <p className="mt-1 text-xs text-ink-600">
                Months already paid at the old salary are paid the difference as arrears on their next payslip.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="revise-reason" className="label">Reason (optional)</label>
            <input id="revise-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual increment" />
          </div>
          {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
        </div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tax declaration
// ---------------------------------------------------------------------------

/**
 * The regime somebody chose and what they declared under the old one.
 *
 * Entered by HR from the employee's declaration form: the elections live in
 * organisation configuration, which only an administrator writes, and a small
 * company's declarations arrive as a form to HR in any case. Payroll already
 * computed TDS from these fields; nothing could set them.
 */
export function TaxDeclarationCard({ emp }: { emp: Employee }) {
  useStatutoryRevision();
  const config = getStatutoryConfig();
  const election = getTaxElectionFor(emp.id);
  const [regime, setRegime] = useState<string>(election.regime ?? '');
  const [declared, setDeclared] = useState(String(election.declaredDeductions ?? ''));
  const [deductedSoFar, setDeductedSoFar] = useState(String(election.taxDeductedSoFar ?? ''));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const effective = taxRegimeFor(emp.id, config);
  const tdsOn = config?.incomeTax.enabled === true;

  async function save() {
    const amount = (value: string) => {
      const n = Math.round(Number(value.replace(/[,\s]/g, '')));
      return value.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    setStatus('saving');
    const ok = await saveTaxElections({
      [emp.id]: {
        ...election,
        regime: regime === 'old' || regime === 'new' ? regime : undefined,
        declaredDeductions: regime === 'old' ? amount(declared) : undefined,
        taxDeductedSoFar: amount(deductedSoFar),
      },
    });
    setStatus(ok ? 'saved' : 'failed');
  }

  return (
    <Card>
      <CardHeader title="Income tax declaration" subtitle="From the employee's declaration form for this financial year" />
      {!tdsOn && (
        <p className="mb-3 text-sm text-ink-600">
          Tax is not deducted in payroll until TDS is switched on in Settings → Payroll Compliance. What is saved here
          is used from then.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <span className="label">Tax regime</span>
          <Select
            ariaLabel="Tax regime"
            value={regime}
            onChange={setRegime}
            options={[
              { label: `Not chosen (${(config?.incomeTax.defaultRegime ?? 'new') === 'new' ? 'new' : 'old'} regime applies)`, value: '' },
              { label: 'New regime', value: 'new' },
              { label: 'Old regime', value: 'old' },
            ]}
          />
        </div>
        <div>
          <label htmlFor="tax-declared" className="label">Declared deductions (₹ a year)</label>
          <input
            id="tax-declared"
            className="input"
            inputMode="numeric"
            value={regime === 'old' ? declared : ''}
            disabled={regime !== 'old'}
            onChange={(e) => setDeclared(e.target.value)}
            placeholder={regime === 'old' ? '150000' : 'Old regime only'}
          />
          <p className="mt-1 text-xs text-ink-500">80C, 80D, HRA and the rest, in one figure.</p>
        </div>
        <div>
          <label htmlFor="tax-deducted" className="label">Tax already deducted this year (₹)</label>
          <input id="tax-deducted" className="input" inputMode="numeric" value={deductedSoFar} onChange={(e) => setDeductedSoFar(e.target.value)} placeholder="0" />
          <p className="mt-1 text-xs text-ink-500">Including by a previous employer, so the rest of the year corrects.</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>Save declaration</Button>
        <span className="text-xs text-ink-600">Taxed under the {effective} regime.</span>
        {status === 'saved' && <span className="text-xs text-emerald-700">Saved</span>}
        {status === 'failed' && <span className="text-xs text-rose-700">Not saved to your organisation — check your connection.</span>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Exit and full & final settlement
// ---------------------------------------------------------------------------

async function settlementPdf(emp: Employee, rows: Array<[string, number]>, net: number, lastDay: string, notes: string[]) {
  // Loaded on demand, as the payslip PDF is — see lib/payslipPdf.ts.
  const { jsPDF } = await import('jspdf');
  const company = getCompanyProfile();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // jsPDF's built-in fonts have no ₹ — see lib/payslipPdf.ts.
  const rs = (n: number) => `${n < 0 ? '-' : ''}Rs. ${Math.abs(n).toLocaleString('en-IN')}`;
  let y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(company.legalName || company.name || 'Full and final settlement', 15, y);
  y += 8;
  doc.setFontSize(11);
  doc.text('Full and final settlement', 15, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const [label, value] of [
    ['Employee', `${emp.fullName} (${emp.employeeCode})`],
    ['Designation', emp.designation],
    ['Date of joining', emp.dateOfJoining],
    ['Last working day', lastDay],
  ] as const) {
    doc.text(`${label}: ${value || '-'}`, 15, y);
    y += 6;
  }
  y += 4;
  for (const [label, value] of rows) {
    doc.text(label, 15, y);
    doc.text(rs(value), 195, y, { align: 'right' });
    y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(net >= 0 ? 'Net payable to employee' : 'Net recoverable from employee', 15, y + 2);
  doc.text(rs(Math.abs(net)), 195, y + 2, { align: 'right' });
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const note of notes) {
    doc.text(doc.splitTextToSize(note, 180), 15, y);
    y += 8;
  }
  doc.save(`full-and-final-${emp.employeeCode}.pdf`);
}

export function ExitCard({ emp }: { emp: Employee }) {
  const [exitOpen, setExitOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [lastDay, setLastDay] = useState(emp.lastWorkingDay ?? todayIso());
  const [exitReason, setExitReason] = useState(emp.exitReason ?? 'Resigned');
  const [noticeShort, setNoticeShort] = useState('0');
  const [other, setOther] = useState('0');
  const [otherNote, setOtherNote] = useState('');
  const [fixedTerm, setFixedTerm] = useState(emp.employmentType === 'Contract');

  const leaving = emp.lastWorkingDay;

  const assessment = useMemo(() => {
    if (!leaving) return null;
    const lastMonth = monthOf(leaving);
    // The salary in force on the last day, at its full monthly rate.
    const components = buildPayslipComponents({ ...emp, lastWorkingDay: undefined }, lastMonth, false);
    const split = splitMonthlyGross(components.monthly, getSalaryStructureFor(emp.id));
    const encashableDays = getApplicableEntitlements(emp, getLeaveRequests(), leaving)
      .filter((entitlement) => entitlement.policy.encashment)
      .reduce((sum, entitlement) => sum + entitlement.available, 0);
    const grat = split
      ? gratuity({ lastDrawnWages: split.basic, joinedIso: emp.dateOfJoining, leavingIso: leaving, fixedTerm })
      : null;
    const settlement = finalSettlement({
      monthlyBasic: split ? split.basic : null,
      monthlyGross: components.monthly,
      encashableDays,
      gratuity: grat ? grat.payable : null,
      noticeShortDays: Number(noticeShort) || 0,
      otherAmount: Number(other) || 0,
    });
    return { lastMonth, components, split, encashableDays, grat, settlement };
  }, [emp, leaving, noticeShort, other, fixedTerm]);

  function recordExit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return;
    const status: EmployeeStatus = lastDay < todayIso() ? 'Resigned' : 'Notice Period';
    updateEmployeeInDirectory({ ...emp, lastWorkingDay: lastDay, exitReason, status });
    setExitOpen(false);
  }

  function withdrawExit() {
    const { lastWorkingDay: _l, exitReason: _r, finalSettlement: _f, ...rest } = emp;
    void _l; void _r; void _f;
    updateEmployeeInDirectory({ ...rest, status: 'Active' });
    setExitOpen(false);
  }

  const rows: Array<[string, number]> = assessment
    ? [
      [`Leave encashment (${assessment.encashableDays} day${assessment.encashableDays === 1 ? '' : 's'})`, assessment.settlement.leaveEncashment],
      [`Gratuity (${assessment.grat?.completedYears ?? 0} completed year${assessment.grat?.completedYears === 1 ? '' : 's'})`, assessment.settlement.gratuity],
      [`Notice not served (${Number(noticeShort) || 0} days)`, -assessment.settlement.noticeRecovery],
      ...(assessment.settlement.otherAmount !== 0
        ? [[otherNote.trim() || 'Other', assessment.settlement.otherAmount] as [string, number]]
        : []),
    ]
    : [];
  const notes = assessment
    ? [
      `The salary for ${monthName(assessment.lastMonth)} up to the last working day is paid in that month's payroll run, prorated, and is not part of this statement.`,
      assessment.settlement.encashmentBasis === 'basic'
        ? 'Leave encashment is Basic / 30 per unused day of leave types marked encashable.'
        : 'No salary structure is set, so leave encashment is priced on gross / 30 per day.',
      assessment.grat
        ? assessment.grat.qualifies
          ? 'Gratuity is 15 days of the last Basic for each completed year (a month taken as 26 days).'
          : `Gratuity is not payable: ${assessment.grat.completedYears} completed year(s), short of the qualifying period.`
        : 'Gratuity needs a salary structure (it is computed on Basic) — set one in Settings → Salary Structure.',
      'Notice recovery is gross / 30 per day not served.',
    ]
    : [];

  function confirm() {
    if (!assessment) return;
    updateEmployeeInDirectory({
      ...emp,
      finalSettlement: {
        confirmedOn: todayIso(),
        encashableDays: assessment.encashableDays,
        leaveEncashment: assessment.settlement.leaveEncashment,
        gratuity: assessment.settlement.gratuity,
        noticeShortDays: Number(noticeShort) || 0,
        noticeRecovery: assessment.settlement.noticeRecovery,
        otherAmount: assessment.settlement.otherAmount,
        ...(otherNote.trim() ? { otherNote: otherNote.trim() } : {}),
        net: assessment.settlement.net,
      },
    });
    setSettleOpen(false);
  }

  return (
    <Card>
      <CardHeader
        title="Exit"
        subtitle={leaving ? `Last working day ${formatDate(leaving)}` : 'When somebody resigns or leaves'}
        action={(
          <Button size="sm" variant="secondary" icon={<LogOut size={14} />} onClick={() => setExitOpen(true)}>
            {leaving ? 'Change exit' : 'Record exit'}
          </Button>
        )}
      />
      {!leaving ? (
        <p className="text-sm text-ink-500">
          Recording a last working day pays them to that day in its month&rsquo;s payroll and takes them off every payroll after it.
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-ink-700">
            {emp.exitReason ?? 'Leaving'} · paid to {formatDate(leaving)} in the {assessment ? monthName(assessment.lastMonth) : ''} payroll.
          </p>
          {emp.finalSettlement ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">Settlement confirmed {formatDate(emp.finalSettlement.confirmedOn)}</Badge>
              <span className="font-semibold text-ink-900">{formatINR(emp.finalSettlement.net)}</span>
              <Button size="sm" variant="ghost" onClick={() => setSettleOpen(true)}>View</Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setSettleOpen(true)}>Full &amp; final settlement</Button>
          )}
        </div>
      )}

      <Modal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title={leaving ? 'Change exit' : 'Record exit'}
        subtitle={emp.fullName}
        size="sm"
        footer={(
          <>
            {leaving && <Button variant="ghost" onClick={withdrawExit}>They are staying</Button>}
            <Button variant="secondary" onClick={() => setExitOpen(false)}>Cancel</Button>
            <Button onClick={recordExit}>Save</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="exit-last-day" className="label">Last working day</label>
            <input id="exit-last-day" type="date" className="input" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
            <p className="mt-1 text-xs text-ink-500">Serving notice until then; shown as resigned after it.</p>
          </div>
          <div>
            <span className="label">Reason</span>
            <Select
              ariaLabel="Exit reason"
              value={exitReason}
              onChange={setExitReason}
              options={['Resigned', 'Let go', 'Contract ended', 'Retired', 'Absconded', 'Other'].map((r) => ({ label: r, value: r }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        title="Full & final settlement"
        subtitle={leaving ? `${emp.fullName} · last working day ${formatDate(leaving)}` : emp.fullName}
        size="md"
        footer={(
          <>
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              onClick={() => assessment && void settlementPdf(emp, rows, assessment.settlement.net, leaving ?? '', notes)}
            >
              Download PDF
            </Button>
            <Button onClick={confirm}>{emp.finalSettlement ? 'Confirm again' : 'Confirm settlement'}</Button>
          </>
        )}
      >
        {assessment && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="settle-notice" className="label">Notice days not served</label>
                <input id="settle-notice" className="input" inputMode="numeric" value={noticeShort} onChange={(e) => setNoticeShort(e.target.value)} />
              </div>
              <div>
                <label htmlFor="settle-other" className="label">Other (+ owed to them, − to recover)</label>
                <input id="settle-other" className="input" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="settle-other-note" className="label">What the other amount is for</label>
                <input id="settle-other-note" className="input" value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="Salary advance recovered" />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={fixedTerm} onChange={(e) => setFixedTerm(e.target.checked)} />
                Fixed-term employee (gratuity after one year instead of five)
              </label>
            </div>
            <table className="w-full" data-testid="settlement-statement">
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-b border-ink-100">
                    <td className="py-1.5 text-ink-700">{label}</td>
                    <td className="py-1.5 text-right font-medium text-ink-900">{formatINR(value)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-2 font-semibold text-ink-900">
                    {assessment.settlement.net >= 0 ? 'Net payable to employee' : 'Net recoverable from employee'}
                  </td>
                  <td className="pt-2 text-right font-bold text-ink-900" data-testid="settlement-net">
                    {formatINR(Math.abs(assessment.settlement.net))}
                  </td>
                </tr>
              </tbody>
            </table>
            <ul className="list-disc space-y-1 pl-5 text-xs text-ink-600">
              {notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        )}
      </Modal>
    </Card>
  );
}
