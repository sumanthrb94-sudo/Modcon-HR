import { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  IndianRupee,
  Users,
  TrendingUp,
  CalendarClock,
  Play,
  Upload,
  Download,
  AlertCircle,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  StatCard,
  Card,
  CardHeader,
  Tabs,
  Table,
  type Column,
  Badge,
  Modal,
  SearchInput,
  Select,
  Avatar,
} from '@/components/ui';
import { statusTone } from '@/components/ui';
import { formatINR, formatDate } from '@/lib/utils';
import { buildPayslip, buildPayslipComponents, storedDeductionRows, salaryByDepartment, getPayrollRuns, savePayrollRuns, getPayslips, savePayslips } from '@/data/payroll';
import { employees, getEmployee } from '@/data/employees';
import { departments } from '@/data/departments';
import { currentMonthIso, todayDate, todayIso } from '@/lib/today';
import { downloadPayslipPdf } from '@/lib/payslipPdf';
import { carriedOverLossOfPay, payeesFor } from '@/data/payRun';
import { getCompanyProfile } from '@/data/companyProfile';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { useSalaryStructureRevision } from '@/lib/useSalaryStructureRevision';
import { useStatutoryRevision } from '@/lib/useStatutoryRevision';
import { useWorkspaceLocked } from '@/lib/subscription';
import StatutoryReturnsPanel from './StatutoryReturnsPanel';
import { useAuth } from '@/lib/auth';
import {
  canUploadPayslips,
  payslipBlobUrl,
  payslipDocId,
  payslipOrgId,
  usePayslipDocuments,
} from '@/lib/payslipDocuments';
import { PayslipUploadModal } from './PayslipUploadModal';
import type { Employee, Payslip, PayrollRun, PayslipDocument } from '@/types';
import { CHART_GRID, CHART_PRIMARY, CHART_TICK_FILL, CHART_TOOLTIP_STYLE } from '@/lib/chartTheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthLabel(m: string): string {
  const [yr, mo] = m.split('-');
  const date = new Date(Number(yr), Number(mo) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Save an uploaded payslip to disk.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * before the browser has started the download cancels it, and holding it for
 * the life of the tab leaks the whole PDF per click.
 */
export function downloadPayslipDocument(document: PayslipDocument) {
  const url = payslipBlobUrl(document.contentBase64);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = document.fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Whether a stored payslip carries a component breakdown at all.
 *
 * A payslip generated while the organisation had no salary structure has every
 * component at zero and its gross in none of them. That is not a breakdown, and
 * rendering it as one shows six rupee-zero rows under a non-zero gross.
 */
function hasComponentBreakdown(payslip: Payslip): boolean {
  return (
    payslip.basic +
      payslip.hra +
      (payslip.medicalAllowance ?? 0) +
      (payslip.conveyanceAllowance ?? 0) +
      payslip.specialAllowance >
    0
  );
}

/** Pay day for a "YYYY-MM" run — the last day of that month. */
function payDateFor(month: string): string {
  const [yr, mo] = month.split('-').map(Number);
  return new Date(Date.UTC(yr, mo, 0)).toISOString().slice(0, 10);
}

/**
 * A payroll run staged for confirmation but not yet committed.
 *
 * Computed once, when the dialog opens, and reused verbatim on Confirm — not
 * recomputed at commit time — so the totals the administrator approved are
 * exactly the totals that get written, whatever else moves on the page while
 * the dialog is open.
 */
interface PendingPayrollRun {
  month: string;
  employeeCount: number;
  grossTotal: number;
  netTotal: number;
  /**
   * Employees this run pays without a component breakdown, because the
   * organisation has not set a salary structure. Gross and net never depend
   * on the split (see data/salaryStructure.ts), so this never zeroes or
   * crashes the preview — it is purely informational.
   */
  unconfiguredCount: number;
  payslips: Payslip[];
  /**
   * Set when this month has already been run and these are the people on
   * roll it did not pay — a catch-up, added to that run, never a second run
   * for anybody already paid.
   */
  topUpOf?: PayrollRun;
}

// ---------------------------------------------------------------------------
// Payslip Modal
// ---------------------------------------------------------------------------

/**
 * Add a run's payslips to the list, replacing any with the same id.
 *
 * A payslip's id is `ps-<employee>-<month>`, one per person per month, and the
 * stored collection is keyed by it. Prepending without this showed the same
 * payslip twice on the page whenever the list already held it — which reads
 * as somebody paid twice.
 */
function withPayslips(existing: Payslip[], added: Payslip[]): Payslip[] {
  const ids = new Set(added.map((p) => p.id));
  return [...added, ...existing.filter((p) => !ids.has(p.id))];
}

/**
 * The months a run may be for: this one and the five before it. A payroll for
 * a month that has not happened is refused by being absent; one further back
 * than six months is a correction, not a run, and belongs to whoever files.
 */
function runnableMonths(current: string): string[] {
  const [year, mon] = current.split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, mon - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

interface PayslipModalProps {
  payslip: Payslip | null;
  onClose: () => void;
}

function PayslipModal({ payslip, onClose }: PayslipModalProps) {
  if (!payslip) return null;
  const emp = getEmployee(payslip.employeeId);
  const empName = emp?.fullName ?? 'Unknown';

  return (
    <Modal
      open={!!payslip}
      onClose={onClose}
      title="Payslip"
      subtitle={`${empName} — ${monthLabel(payslip.month)}`}
      size="lg"
      footer={emp ? (
        // The same PDF the employee downloads from Finance — see lib/payslipPdf.
        <Button
          variant="primary"
          icon={<Download size={16} />}
          onClick={() => { void downloadPayslipPdf(payslip, emp, getCompanyProfile().name || undefined); }}
        >
          Download PDF
        </Button>
      ) : undefined}
    >
      {/* Header strip */}
      <div className="flex items-center gap-4 pb-5 border-b border-ink-100 mb-5">
        <Avatar name={empName} size="lg" />
        <div>
          <p className="font-semibold text-ink-900 text-base">{empName}</p>
          <p className="text-sm text-ink-500">{emp?.designation}</p>
          <p className="text-sm text-ink-500">{emp?.department} · {emp?.employeeCode}</p>
        </div>
        <Badge tone={statusTone(payslip.status)} className="ml-auto">
          {payslip.status}
        </Badge>
      </div>

      {/* Two-column earnings vs deductions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        {/* Earnings */}
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Earnings</p>
          <div className="space-y-2.5">
            {/* A stored payslip carries its own components, so this list is
                driven by the document rather than by today's structure. It is
                empty only for a payslip written with no structure set — which
                the note below says, instead of showing a column of zeroes. */}
            {!hasComponentBreakdown(payslip) && (
              <p className="text-sm text-ink-500">
                No salary structure was set when this payslip was generated, so it has no component
                breakdown. Set one in Settings → Salary Structure.
              </p>
            )}
            {(hasComponentBreakdown(payslip)
              ? [
                  { label: 'Basic Salary', value: payslip.basic },
                  { label: 'House Rent Allowance', value: payslip.hra },
                  // A payslip stored before these components existed carries
                  // neither field; ?? 0 so it renders as a row rather than "₹NaN".
                  { label: 'Medical Allowance', value: payslip.medicalAllowance ?? 0 },
                  { label: 'Conveyance Allowance', value: payslip.conveyanceAllowance ?? 0 },
                  { label: 'Special Allowance', value: payslip.specialAllowance },
                  { label: 'Bonus', value: payslip.bonus },
                ]
              : []
            ).map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
                // Unformatted, so tests/e2e/salary-structure.spec.ts can check
                // that this modal followed a structure change rather than
                // re-deriving the figure from "₹1,04,167".
                data-testid="payslip-component"
                data-component={row.label}
                data-amount={row.value}
              >
                <span className="text-sm text-ink-600">{row.label}</span>
                <span className="text-sm font-medium text-ink-900">{formatINR(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-200 pt-2 mt-2">
              <span className="text-sm font-semibold text-ink-800">Gross Earnings</span>
              <span
                className="text-sm font-bold text-emerald-700"
                data-testid="payslip-gross"
                data-amount={payslip.grossEarnings}
              >
                {formatINR(payslip.grossEarnings)}
              </span>
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Deductions</p>
          <div className="space-y-2.5">
            {/* A STORED payslip, so these are the document's own figures and
                not a recomputation — a payslip is a record of what was paid,
                and re-deriving it from today's settings would rewrite history
                every time an administrator changed a rate.
                The shared `Payslip` shape has fields for provident fund and tax
                and nothing for ESI or professional tax, so those two ride in
                `otherDeductions` alongside loss of pay; `storedDeductionRows`
                splits them back out where the payslip recorded its LOP days,
                and labels the bucket for what it holds where it did not. Live surfaces (Finance, the profile's
                Compensation tab) split them out through `deductionRows`.
                A head that came to zero is omitted rather than shown: "PF ₹0"
                reads as a contribution that was calculated and came to nothing,
                which is not what an organisation running no PF scheme means. */}
            {storedDeductionRows(payslip).map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-ink-600">
                  {row.label}
                  {row.hint && <span className="text-ink-400 ml-1.5 text-xs">{row.hint}</span>}
                </span>
                <span className="text-sm font-medium text-rose-700">{formatINR(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-200 pt-2 mt-2">
              <span className="text-sm font-semibold text-ink-800">Total Deductions</span>
              <span className="text-sm font-bold text-rose-700">{formatINR(payslip.totalDeductions)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Pay highlight */}
      <div className="rounded-xl bg-brand-600 text-white p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-brand-100">Net Pay (Take Home)</p>
          <p className="text-2xl font-bold mt-0.5">{formatINR(payslip.netPay)}</p>
        </div>
        <div className="text-right text-sm text-brand-100">
          <p>{monthLabel(payslip.month)}</p>
          <p className="mt-0.5">Paid on {payslip.status === 'Paid' ? formatDate(payDateFor(payslip.month)) : '—'}</p>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------



export function PayrollPage() {
  const directoryRevision = useEmployeeDirectoryRevision();
  const departmentRevision = useDepartmentDirectoryRevision();
  // Payslip figures are derived from the organisation's split, which an
  // administrator can change while this page is open.
  const salaryStructureRevision = useSalaryStructureRevision();
  useStatutoryRevision();
  const workspaceLocked = useWorkspaceLocked();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('runs');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  // Which month Run Payroll is for. This month by default; up to five back, so
  // a month missed or run late can still be paid — each month once.
  const [runMonth, setRunMonth] = useState(() => currentMonthIso());
  // The PDFs payroll actually issued, keyed by the payslip they document, so
  // the list below can say which months are covered and which are not.
  const { documents: uploadedPayslips } = usePayslipDocuments(profile);
  const uploadedById = useMemo(
    () => new Map(uploadedPayslips.map((document) => [document.id, document])),
    [uploadedPayslips],
  );
  const uploadOrgId = payslipOrgId(profile);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  // The confirmation dialog's own state: a run staged for review, and the
  // refusal shown in its place when the cycle has already been committed.
  // Two separate pieces of state rather than one, because "nothing to
  // confirm" and "here is what would be confirmed" are different screens —
  // conflating them is how the old one-click Run Payroll never got a preview.
  const [pendingRun, setPendingRun] = useState<PendingPayrollRun | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  // Seeded from the store and written through, so a processed run does not
  // revert to Draft on the next refresh.
  const [payrollRunList, setPayrollRunListRaw] = useState(() => getPayrollRuns());
  const setPayrollRunList = (updater: Parameters<typeof setPayrollRunListRaw>[0]) =>
    setPayrollRunListRaw((prev) => savePayrollRuns(typeof updater === 'function' ? (updater as (p: typeof prev) => typeof prev)(prev) : updater));
  const [payslipList, setPayslipListRaw] = useState(() => getPayslips());
  const setPayslipList = (updater: Parameters<typeof setPayslipListRaw>[0]) =>
    setPayslipListRaw((prev) => savePayslips(typeof updater === 'function' ? (updater as (p: typeof prev) => typeof prev)(prev) : updater));

  // Re-read the store when the organisation's split changes. Re-rendering alone
  // is not enough: this list is state seeded once, so without this the modal
  // kept the components it was mounted with. `getPayslips()` returns *stored*
  // payslips unchanged — a payslip that was actually issued keeps the split it
  // was issued under — and recomputes only the unstored seed, which is a
  // statement rather than a document.
  useEffect(() => {
    setPayslipListRaw(getPayslips());
  }, [salaryStructureRevision]);

  // Salaries are disbursed on the last day of the month.
  const nextPayDate = useMemo(() => {
    const today = todayDate();
    const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return lastDay.toISOString().slice(0, 10);
  }, []);
  const daysToPayDate = useMemo(
    () => Math.max(0, Math.round((new Date(nextPayDate).getTime() - todayDate().getTime()) / 86_400_000)),
    [nextPayDate],
  );

  // ----- Aggregates -----
  const totalNetPay = useMemo(() => payslipList.reduce((s, p) => s + p.netPay, 0), [payslipList]);
  const avgCTC = useMemo(() => {
    if (employees.length === 0) return 0;
    const total = employees.reduce((s, e) => s + e.ctc, 0);
    return Math.round(total / employees.length);
  }, [directoryRevision]);

  // ----- Chart data -----
  const chartData = useMemo(
    () =>
      salaryByDepartment().map((d) => ({
        ...d,
        display: d.department.length > 10 ? d.department.slice(0, 8) + '…' : d.department,
        totalLakh: parseFloat((d.total / 100000).toFixed(2)),
      })),
    [directoryRevision, departmentRevision],
  );

  const deptOptions = useMemo(
    () => [
      { label: 'All Departments', value: '' },
      ...departments.map((d) => ({ label: d, value: d })),
    ],
    [departmentRevision],
  );

  const sortedPayrollRuns = useMemo(
    () =>
      payrollRunList
        .slice()
        .sort((left, right) => right.month.localeCompare(left.month)),
    [payrollRunList],
  );

  // ----- Filtered payslips -----
  const filteredPayslips = useMemo(() => {
    return payslipList.filter((p) => {
      const emp = getEmployee(p.employeeId);
      if (!emp) return false;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        emp.fullName.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q);
      const matchesDept = !deptFilter || emp.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [payslipList, search, deptFilter, directoryRevision]);

  /**
   * The per-cycle idempotency guard.
   *
   * `month` identifies a cycle (see PayrollRun in src/types/index.ts), so a
   * run already on the list for this month means this cycle has already been
   * paid — running it again would add a second gross/net total for the same
   * month rather than replacing the first, which is exactly the ₹0 → ₹96.0K
   * double-count QA watched happen on one click. Checked against the live
   * `payrollRunList`, not a snapshot taken when the dialog opened, so a run
   * that lands (another tab, a colleague) while this dialog is still open is
   * still caught at commit time.
   */
  function alreadyRunFor(month: string): PayrollRun | undefined {
    return payrollRunList.find((run) => run.month === month);
  }

  /** Open the Run Payroll confirmation, or refuse with a reason if refused. */
  /** On roll for the month, and holding no payslip for it yet. */
  function unpaidFor(month: string): Employee[] {
    const paid = new Set(payslipList.filter((p) => p.month === month).map((p) => p.employeeId));
    return payeesFor(employees, month).filter((employee) => !paid.has(employee.id));
  }

  function openRunPayrollConfirm(month: string = currentMonthIso()) {
    const existing = alreadyRunFor(month);
    // Already run, but not for everybody on roll: somebody added after the run,
    // or a run made while the directory was still loading. The month is locked
    // against paying anyone twice, and that must not also mean these people
    // can never be paid for it — so they are offered as a catch-up.
    const unpaid = existing ? unpaidFor(month) : [];
    if (existing && unpaid.length > 0) {
      setRunNotice(null);
      const payslips = unpaid.map((employee) => buildPayslip(employee, month, 'Paid'));
      setPendingRun({
        month,
        employeeCount: unpaid.length,
        grossTotal: payslips.reduce((sum, p) => sum + p.grossEarnings, 0),
        netTotal: payslips.reduce((sum, p) => sum + p.netPay, 0),
        unconfiguredCount: unpaid.filter((employee) => !buildPayslipComponents(employee, month).splitConfigured).length,
        payslips,
        topUpOf: existing,
      });
      return;
    }
    if (existing) {
      setPendingRun(null);
      // Not silent, and not a generic error: names the month, when it ran,
      // and what running it again would do — the refusal QA asked for.
      setRunNotice(
        `Payroll for ${monthLabel(month)} has already been run` +
          (existing.processedOn ? ` (processed ${formatDate(existing.processedOn)})` : '') +
          ` for ${existing.employeeCount} employee${existing.employeeCount === 1 ? '' : 's'}, net ${formatINR(existing.netTotal, { compact: true })}. ` +
          `Running it again would pay this cycle twice, so it is refused. To correct a figure, edit the existing run rather than running the cycle again.`,
      );
      return;
    }
    setRunNotice(null);
    // Who is on roll for THIS month: joined by its last day and not resigned.
    // Every directory entry used to be paid, so a resigned employee kept
    // receiving payslips, and a month run late paid people who joined after it.
    const onRoll = payeesFor(employees, month);
    const payslips = onRoll.map((employee) => buildPayslip(employee, month, 'Paid'));
    const grossTotal = payslips.reduce((sum, payslip) => sum + payslip.grossEarnings, 0);
    const netTotal = payslips.reduce((sum, payslip) => sum + payslip.netPay, 0);
    // Informational only — see PendingPayrollRun. Read through
    // buildPayslipComponents (not stored on Payslip) purely to count who has
    // no structure; it does not change what gets paid or saved.
    const unconfiguredCount = onRoll.filter(
      (employee) => !buildPayslipComponents(employee, month).splitConfigured,
    ).length;
    setPendingRun({ month, employeeCount: onRoll.length, grossTotal, netTotal, unconfiguredCount, payslips });
  }

  function closeRunPayrollConfirm() {
    setPendingRun(null);
  }

  /** Commits the run staged by `openRunPayrollConfirm`, guarded once more. */
  function commitPayrollRun() {
    if (!pendingRun || pendingRun.employeeCount === 0) return;
    const existing = alreadyRunFor(pendingRun.month);
    if (pendingRun.topUpOf && existing) {
      // Re-checked at commit: only people still without a payslip for the
      // month, so a colleague's catch-up that landed meanwhile pays nobody twice.
      const stillUnpaid = new Set(unpaidFor(pendingRun.month).map((employee) => employee.id));
      const payslips = pendingRun.payslips.filter((p) => stillUnpaid.has(p.employeeId));
      if (payslips.length > 0) {
        setPayslipList((prev) => withPayslips(prev, payslips));
        setPayrollRunList((prev) => prev.map((run) => (run.id === existing.id
          ? {
            ...run,
            employeeCount: run.employeeCount + payslips.length,
            grossTotal: run.grossTotal + payslips.reduce((sum, p) => sum + p.grossEarnings, 0),
            netTotal: run.netTotal + payslips.reduce((sum, p) => sum + p.netPay, 0),
          }
          : run)));
      }
      setPendingRun(null);
      setRunNotice(null);
      setActiveTab('runs');
      return;
    }
    if (existing) {
      // The guard fired between opening the dialog and clicking Confirm.
      // Re-run the open path so the refusal (and its up-to-date figures)
      // replaces the now-stale preview, rather than committing a duplicate.
      const month = pendingRun.month;
      setPendingRun(null);
      openRunPayrollConfirm(month);
      return;
    }

    const newRun: PayrollRun = {
      id: `pr-${pendingRun.month}`,
      month: pendingRun.month,
      status: 'Paid',
      employeeCount: pendingRun.employeeCount,
      grossTotal: pendingRun.grossTotal,
      netTotal: pendingRun.netTotal,
      // The day it was actually processed. This was `${month}-30`, which is
      // not a date in February and says nothing about when anybody pressed it.
      processedOn: todayIso(),
    };

    setPayrollRunList((prev) => [newRun, ...prev]);
    setPayslipList((prev) => withPayslips(prev, pendingRun.payslips));
    setPendingRun(null);
    setRunNotice(null);
    setActiveTab('runs');
  }

  // ----- Payroll Runs columns -----
  const runColumns: Column<PayrollRun>[] = [
    {
      key: 'month',
      header: 'Month',
      render: (r) => <span className="font-medium text-ink-900">{monthLabel(r.month)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={statusTone(r.status)} dot>
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'right',
      render: (r) => r.employeeCount,
    },
    {
      key: 'gross',
      header: 'Gross Payout',
      align: 'right',
      render: (r) => formatINR(r.grossTotal, { compact: true }),
    },
    {
      key: 'net',
      header: 'Net Payout',
      align: 'right',
      render: (r) => (
        <span className="font-semibold text-ink-900">{formatINR(r.netTotal, { compact: true })}</span>
      ),
    },
    {
      key: 'processedOn',
      header: 'Processed On',
      render: (r) => (r.processedOn ? formatDate(r.processedOn) : <span className="text-ink-400">—</span>),
    },
  ];

  // ----- Payslips columns -----
  const payslipColumns: Column<Payslip>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (p) => {
        const emp = getEmployee(p.employeeId);
        return (
          <div className="flex items-center gap-3">
            <Avatar name={emp?.fullName ?? '?'} size="sm" />
            <div>
              <p className="font-medium text-ink-900">{emp?.fullName}</p>
              <p className="text-xs text-ink-400">{emp?.employeeCode}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'department',
      header: 'Department',
      render: (p) => {
        const emp = getEmployee(p.employeeId);
        return <span className="text-ink-600">{emp?.department}</span>;
      },
    },
    {
      key: 'gross',
      header: 'Gross',
      align: 'right',
      render: (p) => formatINR(p.grossEarnings),
    },
    {
      key: 'deductions',
      header: 'Deductions',
      align: 'right',
      render: (p) => <span className="text-rose-600">-{formatINR(p.totalDeductions)}</span>,
    },
    {
      key: 'netPay',
      header: 'Net Pay',
      align: 'right',
      render: (p) => (
        <span className="font-semibold text-emerald-700">{formatINR(p.netPay)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={statusTone(p.status)} dot>
          {p.status}
        </Badge>
      ),
    },
    {
      // The issued PDF, beside the figures the app computed for the same month.
      // A dash here is coverage information, not an error: it says payroll has
      // not uploaded that month's payslip for this person yet.
      key: 'document',
      header: 'Payslip PDF',
      align: 'right',
      render: (p) => {
        const document = uploadedById.get(payslipDocId(uploadOrgId, p.employeeId, p.month));
        if (!document) return <span className="text-ink-300">—</span>;
        return (
          <Button
            variant="secondary"
            size="sm"
            className="px-2.5 py-1 text-[11px]"
            icon={<Download size={12} />}
            onClick={(event) => {
              event.stopPropagation();
              downloadPayslipDocument(document);
            }}
          >
            PDF
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Manage salary disbursements, payslips, and compensation analytics"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Presentation only — firestore.rules is what refuses the write.
                See the header of src/lib/payslipDocuments.ts. */}
            {canUploadPayslips(profile) && (
              <Button icon={<Upload size={16} />} variant="secondary" onClick={() => setUploadOpen(true)}>
                Upload payslips
              </Button>
            )}
            {/* The billing gate. Presentation only, deliberately — see
                useWorkspaceLocked: the rules protect who owns the subscription
                record, not whether the app runs, because an HR system that
                denied reads over an invoice would take a company's attendance
                history away from it. */}
            <Select
              ariaLabel="Payroll month"
              value={runMonth}
              onChange={setRunMonth}
              options={runnableMonths(currentMonthIso()).map((m) => ({
                label: `${monthLabel(m)}${alreadyRunFor(m) ? ' (run)' : ''}`,
                value: m,
              }))}
              className="!py-1.5 !text-sm w-40"
            />
            <Button
              icon={<Play size={16} />}
              variant="primary"
              onClick={() => openRunPayrollConfirm(runMonth)}
              disabled={workspaceLocked}
              title={workspaceLocked ? 'Paused until billing is arranged — Settings → Billing' : undefined}
            >
              Run Payroll
            </Button>
          </div>
        }
      />

      {/* A refused Run Payroll (the idempotency guard) or nothing at all —
          the button stays enabled either way, so silence here would look
          exactly like a click that did nothing. See openRunPayrollConfirm. */}
      {runNotice && (
        <div
          role="status"
          data-testid="run-payroll-notice"
          className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{runNotice}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Monthly Payroll Cost"
          value={formatINR(totalNetPay, { compact: true })}
          icon={<IndianRupee size={22} />}
        />
        <StatCard
          label="Employees on Payroll"
          value={employees.length}
          icon={<Users size={22} />}
        />
        <StatCard
          label="Average CTC"
          value={formatINR(avgCTC, { compact: true })}
          icon={<TrendingUp size={22} />}
        />
        <StatCard
          label="Next Pay Date"
          value={formatDate(nextPayDate)}
          icon={<CalendarClock size={22} />}
          footer={
            <span className="text-ink-400 text-sm">
              {daysToPayDate === 0 ? 'Today' : `${daysToPayDate} day${daysToPayDate === 1 ? '' : 's'} away`}
            </span>
          }
        />
      </div>

      {/* Bar Chart */}
      <Card className="mb-6">
        <CardHeader
          title="Salary Cost by Department"
          subtitle="Monthly gross payroll (₹ Lakhs)"
        />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis
                dataKey="display"
                tick={{ fontSize: 11, fill: CHART_TICK_FILL }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `₹${v}L`}
                tick={{ fontSize: 11, fill: CHART_TICK_FILL }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                formatter={(value: number) => [`₹${value.toFixed(2)}L`, 'Monthly Cost']}
                labelFormatter={(label: string) => `Dept: ${label}`}
                contentStyle={CHART_TOOLTIP_STYLE}
              />
              <Bar dataKey="totalLakh" fill={CHART_PRIMARY} radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* The returns are built from what payroll computes, so they sit with
          payroll rather than in Settings — the month being filed is the month
          on this page, and the people missing a UAN are the ones in the run
          below. */}
      <div className="mb-6">
        <StatutoryReturnsPanel />
      </div>

      {/* Tabs */}
      <Card padding={false}>
        <div className="px-5 pt-5">
          <Tabs
            tabs={[
              { id: 'runs', label: 'Payroll Runs', count: payrollRunList.length },
              { id: 'payslips', label: 'Payslips', count: payslipList.length },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === 'runs' && (
          <div className="p-5">
            <Table<PayrollRun>
              columns={runColumns}
              data={sortedPayrollRuns}
              keyExtractor={(r) => r.id}
            />
          </div>
        )}

        {activeTab === 'payslips' && (
          <div className="p-5">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search employee…"
                className="flex-1 max-w-xs"
              />
              <Select
                value={deptFilter}
                onChange={setDeptFilter}
                options={deptOptions}
                placeholder="All Departments"
                className="w-52"
              />
            </div>
            <Table<Payslip>
              columns={payslipColumns}
              data={filteredPayslips}
              keyExtractor={(p) => p.id}
              onRowClick={(p) => setSelectedPayslip(p)}
              emptyMessage="No payslips match your filters"
            />
          </div>
        )}
      </Card>

      {/* Payslip Detail Modal */}
      <PayslipModal payslip={selectedPayslip} onClose={() => setSelectedPayslip(null)} />

      <PayslipUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Run Payroll confirmation — previews headcount and cost before this
          commits. The old behaviour wrote payrollRunList and payslipList on
          one click with nothing shown first, which is how QA watched
          ₹0 → ₹96.0K land with no chance to catch a mistake beforehand. */}
      <Modal
        open={!!pendingRun}
        onClose={closeRunPayrollConfirm}
        title={pendingRun?.topUpOf ? 'Pay employees missing from this run' : 'Confirm payroll run'}
        subtitle={pendingRun ? monthLabel(pendingRun.month) : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeRunPayrollConfirm}>
              Cancel
            </Button>
            {/* A run that pays nobody cannot be confirmed. Each month runs
                once, so confirming one would record a permanent ₹0 payroll
                for real employees — QA stopped short of exactly that. */}
            <Button
              variant="primary"
              icon={<Play size={16} />}
              onClick={commitPayrollRun}
              disabled={!pendingRun || pendingRun.employeeCount === 0}
            >
              Confirm & Run Payroll
            </Button>
          </>
        }
      >
        {pendingRun && (
          <div className="space-y-4" data-testid="run-payroll-preview">
            <div>
              <label className="text-sm font-medium text-ink-700 block mb-1">Pay month</label>
              <Select
                ariaLabel="Pay month"
                value={pendingRun.month}
                onChange={(month) => { setRunMonth(month); openRunPayrollConfirm(month); }}
                options={runnableMonths(currentMonthIso()).map((m) => ({
                  label: `${monthLabel(m)}${alreadyRunFor(m) ? ' — already run' : ''}`,
                  value: m,
                }))}
                className="w-full"
              />
            </div>
            {pendingRun.topUpOf ? (
              <p className="text-sm text-ink-600" data-testid="run-payroll-topup">
                Payroll for {monthLabel(pendingRun.month)} already ran for {pendingRun.topUpOf.employeeCount}{' '}
                employee{pendingRun.topUpOf.employeeCount === 1 ? '' : 's'}. These {pendingRun.employeeCount} on roll
                have no payslip for it yet: {pendingRun.payslips.map((p) => getEmployee(p.employeeId)?.fullName ?? p.employeeId).join(', ')}.
                Confirming pays only them and adds them to that run — nobody already paid is paid again.
              </p>
            ) : null}
            <p className="text-sm text-ink-600" hidden={Boolean(pendingRun.topUpOf)}>
              This pays every employee on roll for {monthLabel(pendingRun.month)} — joined by the month&rsquo;s
              end and not resigned — and records the run. Once
              confirmed, this cycle cannot be run again — a second attempt will be refused.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Headcount</p>
                <p
                  className="text-lg font-semibold text-ink-900 mt-1"
                  data-testid="run-payroll-headcount"
                >
                  {pendingRun.employeeCount}
                </p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Gross payout</p>
                <p className="text-lg font-semibold text-ink-900 mt-1" data-testid="run-payroll-gross">
                  {formatINR(pendingRun.grossTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-ink-200 p-3">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Net payout</p>
                <p className="text-lg font-semibold text-emerald-700 mt-1" data-testid="run-payroll-net">
                  {formatINR(pendingRun.netTotal)}
                </p>
              </div>
            </div>
            {pendingRun.employeeCount === 0 && (
              <p role="alert" className="text-sm text-brand-700" data-testid="run-payroll-nobody">
                Nobody was on roll for {monthLabel(pendingRun.month)}: every employee either joined after{' '}
                {monthLabel(pendingRun.month)} or has resigned, so there is nothing to pay and this run cannot be
                confirmed. If someone&rsquo;s joining date is wrong, correct it on their profile first.
              </p>
            )}
            <CarriedOverLossOfPaySection payslips={pendingRun.payslips} />
            {pendingRun.unconfiguredCount > 0 && (
              <p className="text-xs text-amber-700">
                {pendingRun.unconfiguredCount} of {pendingRun.employeeCount} employee
                {pendingRun.employeeCount === 1 ? '' : 's'} have no salary structure configured — their payslip
                will show gross and net pay only, no component breakdown. Set one in Settings → Salary Structure.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Loss of pay this run charges (or refunds) for months that were already
 * paid. It changes somebody's pay for a reason that is not on this month's
 * attendance, so it is listed before Confirm rather than found afterwards on
 * individual payslips. Renders nothing when the run carries none.
 */
function CarriedOverLossOfPaySection({ payslips }: { payslips: Payslip[] }) {
  const rows = carriedOverLossOfPay(payslips);
  if (rows.length === 0) return null;
  const net = rows.reduce((sum, row) => sum + row.amount, 0);
  const people = new Set(rows.map((row) => row.employeeId)).size;
  return (
    <section className="border-2 border-amber-300 bg-amber-50 p-3 space-y-2" data-testid="run-payroll-arrears">
      <h3 className="text-sm font-semibold text-ink-900">Loss of pay carried over from earlier months</h3>
      <p className="text-xs text-ink-700">
        {people} employee{people === 1 ? '' : 's'} had leave or attendance change after a month was already paid.
        This run corrects it: {net >= 0 ? 'a net deduction' : 'a net refund'} of {formatINR(Math.abs(net))}.
        Check each against the leave or attendance record that caused it before confirming.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-600">
              <th className="py-1 pr-3 font-semibold">Employee</th>
              <th className="py-1 pr-3 font-semibold">For</th>
              <th className="py-1 pr-3 font-semibold text-right">Days</th>
              <th className="py-1 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            {rows.map((row) => (
              <tr key={`${row.employeeId}-${row.fromMonth}`}>
                <td className="py-1 pr-3 text-ink-900">{getEmployee(row.employeeId)?.fullName ?? row.employeeId}</td>
                <td className="py-1 pr-3 text-ink-700">{monthLabel(row.fromMonth)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{row.days}</td>
                <td className="py-1 text-right tabular-nums">
                  {row.amount >= 0 ? `Deduct ${formatINR(row.amount)}` : `Refund ${formatINR(-row.amount)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
