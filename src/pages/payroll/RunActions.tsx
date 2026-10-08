import { useState } from 'react';
import { Download, MessageCircle, Mail, Undo2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { bankTransferFile } from '@/data/bankFile';
import { getEmployee } from '@/data/employees';
import { formatINR } from '@/lib/utils';
import type { Payslip, PayrollRun } from '@/types';

/**
 * What happens to a run after it is confirmed: the bank is paid, people are
 * told, and — when it was a mistake — it is taken back.
 */

function monthLong(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function BankFileButton({ run, payslips }: { run: PayrollRun; payslips: Payslip[] }) {
  const [result, setResult] = useState<ReturnType<typeof bankTransferFile> | null>(null);
  function build() {
    const rows = payslips
      .filter((p) => p.month === run.month)
      .map((p) => {
        const e = getEmployee(p.employeeId);
        return {
          employeeCode: e?.employeeCode ?? p.employeeId,
          name: e?.fullName ?? p.employeeId,
          accountNumber: e?.bankAccountNumber,
          ifsc: e?.bankIfsc,
          amount: p.netPay,
        };
      });
    const file = bankTransferFile(rows, `Salary ${monthLong(run.month)}`);
    if (file.included > 0) download(`salary-${run.month}-bank-transfer.csv`, file.csv);
    setResult(file);
  }
  return (
    <>
      <Button size="sm" variant="secondary" className="px-2.5 py-1 text-[11px]" icon={<Download size={12} />} onClick={(e) => { e.stopPropagation(); build(); }}>
        Bank file
      </Button>
      <Modal open={result !== null} onClose={() => setResult(null)} title="Bank transfer file" subtitle={monthLong(run.month)} size="sm">
        {result && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-800">
              {result.included > 0
                ? `Downloaded: ${result.included} ${result.included === 1 ? 'person' : 'people'}, ${formatINR(result.total)} in all. Upload it on your bank's bulk payment screen.`
                : 'Nobody in this run has bank details that can be used, so no file was made.'}
            </p>
            {result.excluded.length > 0 && (
              <div>
                <p className="font-semibold text-amber-800">Not in the file — pay these separately or fix their details on their profile:</p>
                <ul className="mt-1 list-disc pl-5 text-ink-700">
                  {result.excluded.map((row) => <li key={row.employeeCode}>{row.name} ({row.employeeCode}): {row.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * Tell people their payslip is ready — by WhatsApp or email, from HR's own
 * phone or mail. This app has no server to send messages from, so it opens a
 * message ready to send rather than claiming to have sent one.
 */
export function NotifyButton({ run, payslips }: { run: PayrollRun; payslips: Payslip[] }) {
  const [open, setOpen] = useState(false);
  const mine = payslips.filter((p) => p.month === run.month);
  const message = (first: string, net: number) =>
    `Hi ${first}, your payslip for ${monthLong(run.month)} is ready. Net pay: Rs. ${net.toLocaleString('en-IN')}. ` +
    'Sign in to ModCon HR and open Finance & Payslips to download it.';
  return (
    <>
      <Button size="sm" variant="secondary" className="px-2.5 py-1 text-[11px]" icon={<MessageCircle size={12} />} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        Notify
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tell people their payslip is ready" subtitle={`${monthLong(run.month)} · opens WhatsApp or your email with the message written`} size="md">
        <ul className="divide-y divide-ink-100 text-sm">
          {mine.map((p) => {
            const e = getEmployee(p.employeeId);
            if (!e) return null;
            const text = message(e.firstName || e.fullName, p.netPay);
            const phone = (e.phone ?? '').replace(/\D/g, '');
            const waNumber = phone.length === 10 ? `91${phone}` : phone;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium text-ink-900">{e.fullName}</span>
                  <span className="text-ink-500"> · {formatINR(p.netPay)}</span>
                </span>
                <span className="flex gap-2">
                  {waNumber.length >= 11 ? (
                    <a className="btn btn-secondary px-2.5 py-1 text-[11px]" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  ) : <span className="text-xs text-ink-400">No phone</span>}
                  {e.email ? (
                    <a className="btn btn-secondary px-2.5 py-1 text-[11px]" href={`mailto:${e.email}?subject=${encodeURIComponent(`Payslip for ${monthLong(run.month)}`)}&body=${encodeURIComponent(text)}`}>
                      <Mail size={12} /> Email
                    </a>
                  ) : <span className="text-xs text-ink-400">No email</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

/**
 * Take a run back: its record and every payslip it issued for the month.
 *
 * Only the latest run, because later months build on earlier ones — loss of
 * pay arrears and salary arrears are both measured against what an earlier
 * payslip paid, so removing a month underneath a later one would change what
 * the later one should have paid after it was paid.
 */
export function UndoRunButton({ run, onUndo }: { run: PayrollRun; onUndo: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="px-2.5 py-1 text-[11px]" icon={<Undo2 size={12} />} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        Undo
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Undo the ${monthLong(run.month)} run?`}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Keep it</Button>
            <Button variant="danger" onClick={() => { onUndo(); setOpen(false); }}>Undo run</Button>
          </>
        )}
      >
        <div className="space-y-2 text-sm text-ink-700">
          <p>
            This removes the run and the {run.employeeCount} payslip{run.employeeCount === 1 ? '' : 's'} it issued, so the
            month can be run again with corrected attendance, leave or salaries.
          </p>
          <p className="font-semibold text-amber-800">
            It does not take back money already transferred. Undo only a run that has not been paid out yet.
          </p>
        </div>
      </Modal>
    </>
  );
}
