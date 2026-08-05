import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, IndianRupee, Landmark, ReceiptText, Wallet } from 'lucide-react';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
  type Column,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { resolveAppRole } from '@/lib/accessControl';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { usePayslipDocuments } from '@/lib/payslipDocuments';
import { downloadPayslipDocument } from '@/pages/payroll';
import { buildPayslip, buildPayslipComponents, getPayrollRuns } from '@/data/payroll';
import { formatINR, formatDate } from '@/lib/utils';
import type { Payslip } from '@/types';
import { PayrollPage } from '@/pages/payroll';
import { currentMonthIso } from '@/lib/today';

function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  const date = new Date(Number(year), Number(mon) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function EmployeeFinancePage() {
  const { profile } = useAuth();
  const employee = getCurrentEmployee(profile);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        window.clearTimeout(noticeTimeoutRef.current);
      }
    };
  }, []);

  // Declared above the `!employee` guard below: hooks must run in the same
  // order on every render, and an unmatched profile must not change the count.
  const payslipHistory = useMemo(
    () =>
      employee
        ? getPayrollRuns()
            .map((run) => buildPayslip(employee, run.month, run.status))
            .sort((a, b) => b.month.localeCompare(a.month))
        : [],
    [employee],
  );

  // The payslips HR uploaded for this employee. `null` rather than `undefined`
  // when the account matches no employee record: undefined would ask for the
  // whole organisation's payslips, which the rules refuse — rightly.
  const { documents: issuedPayslips } = usePayslipDocuments(profile, employee?.id ?? null);
  const issuedByMonth = useMemo(
    () => new Map(issuedPayslips.map((document) => [document.month, document])),
    [issuedPayslips],
  );

  if (!employee) {
    return (
      <EmptyState
        icon={<Wallet size={24} />}
        title="Finance information unavailable"
        description="We could not match this signed-in account to an employee payroll record."
      />
    );
  }

  const employeeRecord = employee;

  const currentPayslip = buildPayslip(employee, currentMonthIso(), 'Paid');
  const salary = buildPayslipComponents(employee);

  function showDownloadNotice(message: string) {
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    setDownloadNotice(message);
    noticeTimeoutRef.current = window.setTimeout(() => {
      setDownloadNotice(null);
      noticeTimeoutRef.current = null;
    }, 2800);
  }

  async function downloadFinancePdf(payslip: Payslip) {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const margin = 14;
      const lineHeight = 6;
      const maxWidth = 182;
      const pageHeight = 297;
      let y = margin;

      const writeLine = (text: string, options?: { bold?: boolean; size?: number }) => {
        const fontSize = options?.size ?? 10;
        doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);

        const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
        wrapped.forEach((line) => {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += lineHeight;
        });
      };

      writeLine('ModCon HR - Finance Statement', { bold: true, size: 15 });
      writeLine(`Month: ${monthLabel(payslip.month)}`, { bold: true, size: 11 });
      y += 2;

      writeLine('Employee Profile', { bold: true, size: 11 });
      writeLine(`Name: ${employeeRecord.fullName}`);
      writeLine(`Employee Code: ${employeeRecord.employeeCode}`);
      writeLine(`Designation: ${employeeRecord.designation}`);
      writeLine(`Department: ${employeeRecord.department}`);
      writeLine(`Location: ${employeeRecord.location}`);
      writeLine(`Employment Type: ${employeeRecord.employmentType}`);
      writeLine(`Date of Joining: ${formatDate(employeeRecord.dateOfJoining)}`);
      y += 2;

      writeLine('Salary Structure', { bold: true, size: 11 });
      writeLine(`Basic Salary: ${formatINR(payslip.basic)}`);
      writeLine(`House Rent Allowance: ${formatINR(payslip.hra)}`);
      // Nullish rather than truthy: a stored payslip from before these existed
      // has no field at all, and a legitimate zero must still print as ₹0.
      writeLine(`Medical Allowance: ${formatINR(payslip.medicalAllowance ?? 0)}`);
      writeLine(`Convenience Allowance: ${formatINR(payslip.convenienceAllowance ?? 0)}`);
      writeLine(`Special Allowance: ${formatINR(payslip.specialAllowance)}`);
      writeLine(`Bonus: ${formatINR(payslip.bonus)}`);
      writeLine(`Gross Earnings: ${formatINR(payslip.grossEarnings)}`, { bold: true });
      y += 2;

      writeLine('Deductions', { bold: true, size: 11 });
      // Attendance is the only basis for deduction, so the payslip PDF lists
      // loss of pay alone rather than statutory heads that are never withheld.
      writeLine(`Loss of Pay (unpaid absence): ${formatINR(payslip.otherDeductions)}`);
      writeLine(`Total Deductions: ${formatINR(payslip.totalDeductions)}`, { bold: true });
      y += 2;

      writeLine('Salary Information', { bold: true, size: 11 });
      writeLine(`Annual CTC: ${formatINR(employeeRecord.ctc)}`);
      writeLine(`Monthly CTC: ${formatINR(Math.round(employeeRecord.ctc / 12))}`);
      writeLine(`Payroll Status: ${payslip.status}`);
      writeLine(`Net Pay (Take Home): ${formatINR(payslip.netPay)}`, { bold: true, size: 11 });

      doc.save(`finance-statement-${employeeRecord.employeeCode}-${payslip.month}.pdf`);
      showDownloadNotice(`PDF downloaded for ${monthLabel(payslip.month)}.`);
    } catch {
      showDownloadNotice('Unable to generate PDF right now. Please try again.');
    }
  }

  const payslipColumns: Column<Payslip>[] = [
    {
      key: 'month',
      header: 'Month',
      render: (row) => <span className="font-medium text-ink-900">{monthLabel(row.month)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={row.status === 'Paid' ? 'green' : row.status === 'Completed' ? 'blue' : 'amber'}>{row.status}</Badge>,
    },
    {
      key: 'gross',
      header: 'Gross Earnings',
      align: 'right',
      render: (row) => <span className="text-sm text-ink-700">{formatINR(row.grossEarnings)}</span>,
    },
    {
      key: 'deductions',
      header: 'Deductions',
      align: 'right',
      render: (row) => <span className="text-sm text-rose-700">{formatINR(row.totalDeductions)}</span>,
    },
    {
      key: 'net',
      header: 'Net Pay',
      align: 'right',
      render: (row) => <span className="font-semibold text-emerald-700">{formatINR(row.netPay)}</span>,
    },
    {
      key: 'payslip',
      header: 'Payslip',
      align: 'right',
      render: (row) => {
        // The payslip HR issued for this month is the authoritative document —
        // it is what payroll actually paid against. The statement below it is
        // this app's own calculation, kept because it itemises the deductions
        // and because a month may have no upload at all.
        const issued = issuedByMonth.get(row.month);
        return (
          <div className="flex items-center justify-end gap-2">
            {issued ? (
              <Button
                variant="primary"
                size="sm"
                className="px-2.5 py-1 text-[11px]"
                icon={<Download size={12} />}
                data-testid="issued-payslip-download"
                data-month={row.month}
                onClick={(event) => {
                  event.stopPropagation();
                  downloadPayslipDocument(issued);
                }}
              >
                Payslip
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              className="px-2.5 py-1 text-[11px]"
              icon={<Download size={12} />}
              onClick={(event) => {
                event.stopPropagation();
                void downloadFinancePdf(row);
              }}
            >
              {issued ? 'Statement' : 'PDF'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        subtitle="Complete salary information, earnings, deductions, and payslip history for your employee account."
      />

      {downloadNotice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800" role="status" aria-live="polite">
          {downloadNotice}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Annual CTC"
          value={formatINR(employee.ctc)}
          icon={<IndianRupee size={22} />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Monthly Gross"
          value={formatINR(currentPayslip.grossEarnings)}
          icon={<Wallet size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Total Deductions"
          value={formatINR(currentPayslip.totalDeductions)}
          icon={<ReceiptText size={22} />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <StatCard
          label="Net Pay"
          value={formatINR(currentPayslip.netPay)}
          icon={<Landmark size={22} />}
          iconClass="bg-cyan-50 text-cyan-700"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <Avatar name={employee.fullName} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-ink-900">{employee.fullName}</h2>
              <p className="text-sm text-ink-500">{employee.designation}</p>
              <p className="text-xs text-ink-400 mt-1">{employee.department} · {employee.employeeCode}</p>
            </div>
          </div>
          <div className="md:ml-auto rounded-xl bg-brand-600 px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-wide text-brand-100">Current payout</p>
            <p className="mt-1 text-2xl font-bold">{formatINR(currentPayslip.netPay)}</p>
            <p className="mt-1 text-xs text-brand-100">Paid for {monthLabel(currentPayslip.month)}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Salary Structure" subtitle="Detailed monthly earnings for the current cycle" />
          <div className="space-y-3">
            {[
              { label: 'Basic Salary', value: salary.basic },
              { label: 'House Rent Allowance', value: salary.hra },
              { label: 'Medical Allowance', value: salary.medicalAllowance },
              { label: 'Convenience Allowance', value: salary.convenienceAllowance },
              { label: 'Special Allowance', value: salary.specialAllowance },
              { label: 'Bonus', value: salary.bonus },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-ink-600">{item.label}</span>
                <span className="font-medium text-ink-900">{formatINR(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-sm">
              <span className="font-semibold text-ink-900">Gross Earnings</span>
              <span className="font-bold text-emerald-700">{formatINR(salary.grossEarnings)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Deductions" subtitle="Pay withheld for unpaid absence" />
          <div className="space-y-3">
            {/* Attendance is the only basis for deduction, so PF and TDS are
                not withheld and are not shown — see buildPayslipComponents. */}
            {[
              { label: 'Loss of Pay (unpaid absence)', value: salary.otherDeductions },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="text-ink-600">{item.label}</span>
                <span className="font-medium text-rose-700">{formatINR(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-sm">
              <span className="font-semibold text-ink-900">Total Deductions</span>
              <span className="font-bold text-rose-700">{formatINR(salary.totalDeductions)}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Salary Information" subtitle="Employee compensation details for your account" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Department</p>
            <p className="mt-1 text-ink-800">{employee.department}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Location</p>
            <p className="mt-1 text-ink-800">{employee.location}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Employment Type</p>
            <p className="mt-1 text-ink-800">{employee.employmentType}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Date of Joining</p>
            <p className="mt-1 text-ink-800">{formatDate(employee.dateOfJoining)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Monthly CTC</p>
            <p className="mt-1 text-ink-800">{formatINR(salary.monthly)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Gross Earnings</p>
            <p className="mt-1 text-ink-800">{formatINR(salary.grossEarnings)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Take Home Pay</p>
            <p className="mt-1 text-emerald-700 font-semibold">{formatINR(salary.netPay)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Payroll Status</p>
            <p className="mt-1 text-ink-800">{currentPayslip.status}</p>
          </div>
        </div>
      </Card>

      <Card padding={false}>
        <CardHeader title="Payslip History" subtitle="Recent payroll cycles for your employee account" />
        <Table columns={payslipColumns} data={payslipHistory} keyExtractor={(row) => row.id} />
      </Card>
    </div>
  );
}

export function FinancePage() {
  const { profile } = useAuth();
  const role = resolveAppRole(profile);

  if (role !== 'Employee') {
    return <PayrollPage />;
  }

  return <EmployeeFinancePage />;
}
