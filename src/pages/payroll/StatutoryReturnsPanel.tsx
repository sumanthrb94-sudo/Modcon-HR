import { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Info } from 'lucide-react';
import { Card, CardHeader, Button, Badge, Select } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { currentMonthIso } from '@/lib/today';
import { useStatutoryRevision } from '@/lib/useStatutoryRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { ATTENDANCE_CHANGED_EVENT } from '@/data/attendance';
import {
  buildMonthlyEcr,
  buildQuarterlyTdsSchedule,
  employeesMissingStatutoryIdentifiers,
} from '@/data/statutoryReturns';
import { financialQuarterOf, type ReturnProblem } from '@/data/returnFiles';

/**
 * Payroll → Statutory returns.
 *
 * The ECR is the actual filing: a `#~#`-delimited text file uploaded to the
 * EPFO employer portal as it is downloaded here. The TDS schedule is not — a
 * quarterly salary return is validated through the department's own utility,
 * and this is the deductee-wise working that goes into it. The panel says which
 * is which, because a download labelled "Form 138" that is not a filed return
 * is worse than no download at all.
 *
 * ## Problems are shown, and the file is still generated
 *
 * A member with no UAN cannot be filed, and blocking the whole return on them
 * would stop an employer remitting for the ninety people whose details are
 * complete — on the 15th. So the file covers who it can, everybody it could not
 * is named, and the totals are computed from the filed set so they reconcile
 * against the challan rather than against the intention.
 */

/** A month or two back, plus this one: what an employer is actually filing. */
function recentMonths(count = 6): string[] {
  const [year, month] = currentMonthIso().split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Hand the file to the browser.
 *
 * A blob URL rather than a data one: an ECR for a few hundred members runs to
 * tens of kilobytes and a data URL that long is refused by some browsers
 * silently, which presents as a download button that does nothing.
 */
function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ProblemList({ problems }: { problems: readonly ReturnProblem[] }) {
  if (problems.length === 0) return null;
  const blocking = problems.filter((problem) => problem.severity === 'blocking');

  return (
    <div className="mt-3 border border-amber-500 bg-amber-50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
        <AlertTriangle size={14} className="shrink-0 text-amber-600" />
        {blocking.length > 0
          ? `${blocking.length} ${blocking.length === 1 ? 'person is' : 'people are'} not on this file`
          : `${problems.length} to check before filing`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {problems.map((problem) => (
          <li key={`${problem.employeeId}-${problem.message}`} className="text-xs leading-relaxed text-ink-700">
            <span className="font-medium">{problem.name}</span>
            <span className="text-ink-400"> · {problem.employeeCode} · </span>
            {problem.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotConfigured({ scheme }: { scheme: string }) {
  return (
    <p className="text-sm text-ink-500 leading-relaxed">
      This organisation has not declared a {scheme} registration, so there is no return to file.
      Settings → Payroll Compliance.
    </p>
  );
}

export default function StatutoryReturnsPanel() {
  // The returns are computed from the directory, from attendance (unpaid days
  // are the ECR's non-contributing days) and from the statutory configuration.
  // A panel that captured any of the three at mount would offer a stale file to
  // download, which is the one artefact here that leaves the building.
  const statutoryRevision = useStatutoryRevision();
  const directoryRevision = useEmployeeDirectoryRevision();
  const attendanceRevision = useCollectionRevision(ATTENDANCE_CHANGED_EVENT);
  const revision = `${statutoryRevision}-${directoryRevision}-${attendanceRevision}`;

  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0]);

  const ecr = useMemo(() => buildMonthlyEcr(month), [month, revision]);
  const tds = useMemo(() => buildQuarterlyTdsSchedule(month), [month, revision]);
  const missing = useMemo(() => employeesMissingStatutoryIdentifiers(), [revision]);
  const quarter = financialQuarterOf(month);

  return (
    <Card>
      <CardHeader
        title="Statutory returns"
        subtitle="Built from what payroll computes today, not from a stored payslip"
        action={
          <Select
            className="w-44"
            ariaLabel="Return month"
            value={month}
            onChange={setMonth}
            options={months.map((value) => ({ value, label: monthLabel(value) }))}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- ECR ------------------------------------------------------- */}
        <div className="border border-ink-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink-900">EPFO ECR</h3>
              <p className="text-sm text-ink-500">
                Electronic Challan cum Return · {monthLabel(month)}
              </p>
            </div>
            <Badge tone="green">Files as-is</Badge>
          </div>

          {!ecr.configured ? (
            <div className="mt-3"><NotConfigured scheme="EPF" /></div>
          ) : (
            <>
              <p className="mt-3 text-xs text-ink-500">
                Establishment <span className="font-medium text-ink-700">{ecr.establishmentCode}</span>
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {[
                  ['Members filed', String(ecr.totals.members)],
                  ['EPF wages', formatINR(ecr.totals.epfWages)],
                  ['Employee share', formatINR(ecr.totals.employeeShare)],
                  ['Pension (EPS)', formatINR(ecr.totals.pensionShare)],
                  ['Employer EPF', formatINR(ecr.totals.employerShare)],
                ].map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className="text-right font-medium tabular-nums text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                These totals cover the members on the file, not everybody in the directory — so they
                reconcile against the challan rather than against the intention.
              </p>

              <Button
                className="mt-3"
                variant="secondary"
                disabled={ecr.included === 0}
                onClick={() => download(ecr.filename, ecr.text, 'text/plain')}
              >
                <Download size={14} className="mr-1.5" />
                {ecr.included === 0 ? 'Nothing to file' : `Download ${ecr.filename}`}
              </Button>

              <ProblemList problems={ecr.problems} />
            </>
          )}
        </div>

        {/* ---- TDS ------------------------------------------------------- */}
        <div className="border border-ink-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink-900">Salary TDS · {quarter.label}</h3>
              <p className="text-sm text-ink-500">Deductee-wise schedule for the quarter</p>
            </div>
            <Badge tone="amber">Working, not the return</Badge>
          </div>

          {!tds.configured ? (
            <div className="mt-3"><NotConfigured scheme="TDS" /></div>
          ) : (
            <>
              <p className="mt-3 text-xs text-ink-500">
                TAN <span className="font-medium text-ink-700">{tds.tan}</span>
                {' · '}
                {tds.months.map(monthLabel).join(', ')}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-ink-500">Deductees</dt>
                <dd className="text-right font-medium tabular-nums text-ink-900">{tds.included}</dd>
                <dt className="text-ink-500">Tax withheld</dt>
                <dd className="text-right font-medium tabular-nums text-ink-900">
                  {formatINR(tds.totalTds)}
                </dd>
              </dl>

              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
                <Info size={13} className="mt-0.5 shrink-0 text-ink-400" />
                <span>
                  A quarterly salary return is prepared in the department&rsquo;s Return Preparation
                  Utility and validated through the FVU, and what that emits is the file the
                  department accepts. Nothing generated in a browser is that file. This is the
                  deductee-wise working that goes <em>into</em> it — PAN, amount paid and tax
                  withheld, month by month — which is the part payroll knows and the part that is
                  miserable to assemble by hand.
                </span>
              </p>

              <Button
                className="mt-3"
                variant="secondary"
                disabled={tds.included === 0}
                onClick={() => download(tds.filename, tds.text, 'text/csv')}
              >
                <FileText size={14} className="mr-1.5" />
                {tds.included === 0 ? 'Nothing withheld this quarter' : `Download ${tds.filename}`}
              </Button>

              <ProblemList problems={tds.problems} />
            </>
          )}
        </div>
      </div>

      {/* ---- Missing details ---------------------------------------------- */}
      {missing.length > 0 && (
        <div className="mt-5 border-t border-ink-200 pt-4">
          <h3 className="font-semibold text-ink-900">Details a return needs</h3>
          <p className="text-sm text-ink-500 mb-3">
            Asked here rather than as a list of errors after the file is built: the fix is on
            somebody&rsquo;s profile and the deadline is the 15th.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {missing.map((person) => (
              <li key={person.employeeId} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-ink-800">{person.name}</span>
                <span className="text-xs text-ink-400">{person.employeeCode}</span>
                <span className="ml-auto text-xs text-amber-700">{person.missing.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
