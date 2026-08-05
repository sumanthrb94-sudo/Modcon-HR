/**
 * Bulk payslip upload: one month, many PDFs, matched to people by employee code.
 *
 * The review step is the point of the whole dialog. Uploading 43 files blind is
 * how a payslip lands on the wrong person — a salary disclosed to a colleague is
 * not a defect you can take back — so nothing is written until the administrator
 * has seen which file went to whom, what will be replaced, and what could not be
 * matched at all. Files that match nobody are listed rather than dropped: a file
 * silently ignored looks exactly like a file successfully uploaded.
 */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, Upload } from 'lucide-react';

import { Avatar, Button, Modal } from '@/components/ui';
import { getEmployeeDirectory } from '@/data/employees';
import { useAuth } from '@/lib/auth';
import {
  formatBytes,
  matchPayslipFiles,
  payslipDocId,
  payslipOrgId,
  uploadPayslipDocument,
  usePayslipDocuments,
  PAYSLIP_MAX_BYTES,
  type PayslipFileMatch,
} from '@/lib/payslipDocuments';
import { currentMonthIso } from '@/lib/today';

interface Props {
  open: boolean;
  onClose: () => void;
}

function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  if (!year || !mon) return month;
  return new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function PayslipUploadModal({ open, onClose }: Props) {
  const { profile } = useAuth();
  const { documents } = usePayslipDocuments(open ? profile : null);
  const [month, setMonth] = useState(currentMonthIso());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const existingIds = useMemo(
    () => new Set(documents.map((document) => document.id)),
    [documents],
  );

  const { matched, unmatched } = useMemo(
    () =>
      matchPayslipFiles(files, getEmployeeDirectory(), {
        existingIds,
        orgId: payslipOrgId(profile),
        month,
      }),
    [files, existingIds, profile, month],
  );

  function reset() {
    setFiles([]);
    setFailures([]);
    setUploaded(null);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleUpload() {
    if (busy || matched.length === 0) return;
    setBusy(true);
    setFailures([]);
    setUploaded(null);
    setProgress({ done: 0, total: matched.length });

    const failed: string[] = [];
    let done = 0;

    // Sequential rather than Promise.all: 43 concurrent writes of a few hundred
    // KB each is a burst against a project with a daily quota, and a failure
    // part-way through a parallel run leaves the administrator unable to say
    // which people were covered. One at a time, the count below is the answer.
    for (const match of matched as PayslipFileMatch[]) {
      try {
        await uploadPayslipDocument(profile, {
          employee: match.employee,
          month,
          file: match.file,
        });
      } catch (error) {
        failed.push(
          `${match.employee.fullName} (${match.employee.employeeCode}): ${
            error instanceof Error ? error.message : 'upload failed'
          }`,
        );
      }
      done += 1;
      setProgress({ done, total: matched.length });
    }

    setFailures(failed);
    setUploaded(matched.length - failed.length);
    setBusy(false);
    setFiles([]);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload payslips"
      subtitle="One month at a time. Each PDF is matched to an employee by the employee code in its filename."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            {uploaded === null ? 'Cancel' : 'Done'}
          </Button>
          <Button variant="primary" onClick={handleUpload} disabled={busy || matched.length === 0}>
            {busy
              ? `Uploading ${progress?.done ?? 0} of ${progress?.total ?? 0}…`
              : `Upload ${matched.length} payslip${matched.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="payslip-month">
              Month
            </label>
            <input
              id="payslip-month"
              type="month"
              className="input w-full"
              aria-label="Payslip month"
              value={month}
              max={currentMonthIso()}
              onChange={(event) => setMonth(event.target.value || currentMonthIso())}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1.5" htmlFor="payslip-files">
              Payslip PDFs
            </label>
            <input
              id="payslip-files"
              ref={fileInput}
              type="file"
              multiple
              accept="application/pdf"
              className="input w-full"
              aria-label="Payslip PDFs"
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setUploaded(null);
                setFailures([]);
              }}
            />
            <p className="mt-1 text-xs text-ink-400">
              PDF, up to {formatBytes(PAYSLIP_MAX_BYTES)} each. Name them with the employee code,
              e.g. <span className="font-mono">MC-090-august.pdf</span>.
            </p>
          </div>
        </div>

        {uploaded !== null && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              failures.length === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
            }`}
            role="status"
          >
            {uploaded} payslip{uploaded === 1 ? '' : 's'} uploaded for {monthLabel(month)}
            {failures.length > 0 ? `, ${failures.length} failed` : '.'}
            {failures.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-ink-100">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs font-semibold text-ink-600">
                <span>Matched to an employee</span>
                <span data-testid="payslip-matched-count">{matched.length}</span>
              </div>
              {matched.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-400">
                  None of the chosen files name an employee code.
                </p>
              ) : (
                <ul className="divide-y divide-ink-50">
                  {matched.map((match) => (
                    <li
                      key={match.file.name}
                      className="flex items-center gap-3 px-4 py-2.5"
                      data-testid="payslip-match"
                      data-employee-code={match.employee.employeeCode}
                    >
                      <Avatar name={match.employee.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {match.employee.fullName}
                        </p>
                        <p className="truncate text-xs text-ink-400">
                          {match.employee.employeeCode} · {match.file.name} ·{' '}
                          {formatBytes(match.file.size)}
                        </p>
                      </div>
                      <span className="ml-auto shrink-0 text-xs">
                        {match.replaces ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <RefreshCw size={12} /> replaces existing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={12} /> new
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {unmatched.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50">
                <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle size={13} />
                  Not uploaded — no employee to attach these to
                  <span className="ml-auto" data-testid="payslip-unmatched-count">
                    {unmatched.length}
                  </span>
                </div>
                <ul className="divide-y divide-amber-100">
                  {unmatched.map((miss) => (
                    <li key={miss.file.name} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <FileText size={14} className="shrink-0 text-amber-700" />
                      <span className="truncate text-ink-800">{miss.file.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-amber-800">{miss.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {files.length === 0 && uploaded === null && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-ink-200 px-4 py-6 text-sm text-ink-400">
            <Upload size={18} />
            Choose the month's payslip PDFs. Nothing is uploaded until you have seen the match list.
          </div>
        )}
      </div>
    </Modal>
  );
}
