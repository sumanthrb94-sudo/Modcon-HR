import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Select } from '@/components/ui';
import { getEmployeeDirectory } from '@/data/employees';
import { getPayAdjustments, savePayAdjustments, PAY_ADJUSTMENTS_CHANGED_EVENT, type PayAdjustment } from '@/data/payAdjustments';
import { payRunRoll } from '@/data/payRun';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { formatINR } from '@/lib/utils';

/**
 * One-off earnings and deductions for a month, entered before it is run.
 * See data/payAdjustments.ts for what each kind does to tax and PF.
 */
export function OneOffPayCard({ month, monthLabel, alreadyRun }: { month: string; monthLabel: string; alreadyRun: boolean }) {
  const revision = useCollectionRevision(PAY_ADJUSTMENTS_CHANGED_EVENT);
  const directoryRevision = useEmployeeDirectoryRevision();
  const [items, setItems] = useState<PayAdjustment[]>(() => getPayAdjustments());
  useEffect(() => { setItems(getPayAdjustments()); }, [revision]);
  const roll = useMemo(() => payRunRoll(getEmployeeDirectory(), month).payees, [month, directoryRevision]);
  const nameOf = useMemo(() => new Map(roll.map((e) => [e.id, `${e.fullName} (${e.employeeCode})`])), [roll]);

  const [employeeId, setEmployeeId] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'earning' | 'deduction'>('earning');
  const [taxable, setTaxable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const forMonth = items.filter((a) => a.month === month);

  function add() {
    const value = Math.round(Number(amount.replace(/[,\s]/g, '')));
    if (!employeeId) return setError('Choose who it is for.');
    if (!label.trim()) return setError('Say what it is — the payslip prints this.');
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount in rupees.');
    setError(null);
    const next: PayAdjustment = {
      id: `adj-${employeeId}-${month}-${Date.now().toString(36)}`,
      employeeId,
      month,
      label: label.trim(),
      amount: value,
      kind,
      taxable: kind === 'earning' ? taxable : false,
    };
    setItems(savePayAdjustments([...getPayAdjustments(), next]));
    setLabel('');
    setAmount('');
  }

  function remove(id: string) {
    setItems(savePayAdjustments(getPayAdjustments().filter((a) => a.id !== id)));
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={`One-off pay for ${monthLabel}`}
        subtitle="Bonuses, incentives, recoveries and corrections — paid with this month's run"
      />
      {alreadyRun && (
        <p className="mb-3 text-sm text-amber-800">
          {monthLabel} has been run. Items added now reach only people paid in a catch-up run; undo the run to include
          them for everyone.
        </p>
      )}
      {forMonth.length > 0 ? (
        <ul className="mb-4 divide-y divide-ink-100 border border-ink-200 text-sm">
          {forMonth.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                {nameOf.get(a.employeeId) ?? a.employeeId} · {a.label}
                <span className="text-ink-400"> · {a.kind === 'earning' ? (a.taxable ? 'taxable earning' : 'non-taxable earning') : 'deduction'}</span>
              </span>
              <span className={a.kind === 'deduction' ? 'text-rose-700' : 'text-emerald-700'}>
                {a.kind === 'deduction' ? '−' : '+'}{formatINR(a.amount)}
              </span>
              <button type="button" aria-label={`Remove ${a.label}`} className="p-1 text-ink-400 hover:text-rose-600" onClick={() => remove(a.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-ink-500">Nothing beyond salary this month.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-6 items-end">
        <div className="sm:col-span-2">
          <span className="label">Employee</span>
          <Select
            ariaLabel="One-off pay employee"
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="Choose…"
            options={roll.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="oneoff-label">What it is</label>
          <input id="oneoff-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Diwali bonus" />
        </div>
        <div>
          <label className="label" htmlFor="oneoff-amount">Amount (₹)</label>
          <input id="oneoff-amount" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
        </div>
        <div>
          <span className="label">Kind</span>
          <Select
            ariaLabel="One-off pay kind"
            value={kind}
            onChange={(v) => setKind(v === 'deduction' ? 'deduction' : 'earning')}
            options={[
              { value: 'earning', label: 'Pay (earning)' },
              { value: 'deduction', label: 'Recover (deduction)' },
            ]}
          />
        </div>
        <Button icon={<Plus size={14} />} onClick={add}>Add</Button>
      </div>
      {kind === 'earning' && (
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-600">
          <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
          Taxable — counted as income for TDS and ESI. Bonus and incentives are; a reimbursement against bills is not.
          Provident fund is never computed on one-off pay.
        </label>
      )}
      {error && <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p>}
    </Card>
  );
}
