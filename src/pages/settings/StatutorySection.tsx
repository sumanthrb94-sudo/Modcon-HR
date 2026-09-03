import { useMemo, useState } from 'react';
import { AlertCircle, Check, IndianRupee, MapPin, Plus, Trash2 } from 'lucide-react';
import { Card, Button, Badge, Select } from '@/components/ui';
import { useCollectionRevision } from '@/lib/useCollectionRevision';
import { getEmployeeDirectory } from '@/data/employees';
import { mergeLocations } from '@/data/locations';
import {
  INDIA_STATUTORY_RATES,
  NO_STATUTORY_CONFIG,
  REFERENCE_PROFESSIONAL_TAX,
  STATUTORY_CHANGED_EVENT,
  getStatutoryConfig,
  saveStatutoryConfig,
  type ProfessionalTaxSchedule,
  type StatutoryConfig,
} from '@/data/statutory';

/**
 * Settings → Payroll Compliance.
 *
 * Its own file rather than another section inside settings/index.tsx, which is
 * already past five thousand lines — the CheckinPolicySection and ShiftsSection
 * precedent.
 *
 * ## What this page is for
 *
 * Every statutory scheme in this app is **off until an administrator declares
 * the registration here**, and that is the point of the page rather than a
 * limitation of it. The rates are the law and ship with the app; whether an
 * establishment is covered depends on headcount, state and business, and an app
 * that assumed it would either deduct money from people it should not or
 * under-deduct and leave the employer holding the liability.
 *
 * So each scheme asks for the one thing that cannot be inferred — an
 * establishment code, a TAN — and refuses to switch on without it: a deduction
 * with nowhere to remit to is worse than no deduction.
 *
 * ## The dates are load-bearing
 *
 * Every rate is shown with the month it was last checked. A rate that has moved
 * is worse than one that is missing, because a payslip computed on last year's
 * slab looks exactly like a payslip computed on this year's — so the page says
 * how old its figures are rather than presenting them as timeless.
 */

const ratesCheckedAt = INDIA_STATUTORY_RATES.checkedAgainst;

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-3 border-b border-ink-200 last:border-b-0 sm:grid-cols-[220px_1fr] sm:gap-6">
      <div>
        <p className="text-sm font-medium text-ink-900">{label}</p>
        {hint && <p className="text-xs text-ink-500 mt-0.5">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-brand-600"
      />
      {label}
    </label>
  );
}

/** The rate figures, stated so an administrator can check them against a notice. */
function RateNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-ink-500 mt-2 leading-relaxed">
      {children} <span className="text-ink-400">· checked {ratesCheckedAt}</span>
    </p>
  );
}

export default function StatutorySection() {
  const revision = useCollectionRevision(STATUTORY_CHANGED_EVENT);
  const stored = useMemo(() => getStatutoryConfig(), [revision]);
  const [draft, setDraft] = useState<StatutoryConfig>(() => getStatutoryConfig() ?? NO_STATUTORY_CONFIG);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  // The locations people actually work at, so professional tax can be mapped to
  // a state per location. Declared locations union where people are — the same
  // list Add Employee offers, for the same reason.
  const locations = useMemo(() => {
    const directory = getEmployeeDirectory();
    return mergeLocations(directory.map((employee) => employee.location).filter(Boolean));
  }, [revision]);

  const declaredStates = useMemo(
    () => draft.professionalTax.schedules.map((schedule) => schedule.state),
    [draft.professionalTax.schedules],
  );

  const unmappedLocations = useMemo(
    () => locations.filter((location) => !draft.professionalTax.stateByLocation[location]),
    [locations, draft.professionalTax.stateByLocation],
  );

  const dirty = JSON.stringify(stored ?? NO_STATUTORY_CONFIG) !== JSON.stringify(draft);

  function patch(next: Partial<StatutoryConfig>) {
    setDraft((current) => ({ ...current, ...next }));
    setSaving('idle');
  }

  function save() {
    setError(null);
    // The same refusals `normalizeStatutoryConfig` applies, said out loud
    // *before* the save rather than discovered afterwards as a toggle that
    // silently would not stay on.
    if (draft.epf.enabled && !draft.epf.establishmentCode.trim()) {
      setError('EPF needs the establishment code it will be remitted under.');
      return;
    }
    if (draft.esi.enabled && !draft.esi.establishmentCode.trim()) {
      setError('ESI needs the establishment code it will be remitted under.');
      return;
    }
    if (draft.incomeTax.enabled && !draft.incomeTax.tan.trim()) {
      setError('TDS needs the employer’s TAN — every challan and every return carries it.');
      return;
    }
    if (draft.professionalTax.enabled && draft.professionalTax.schedules.length === 0) {
      setError('Professional tax needs at least one state’s schedule.');
      return;
    }
    setSaving('saving');
    void saveStatutoryConfig(draft).then((landed) => setSaving(landed ? 'saved' : 'failed'));
  }

  function addReferenceSchedule(state: string) {
    const reference = REFERENCE_PROFESSIONAL_TAX.find((schedule) => schedule.state === state);
    if (!reference) return;
    if (declaredStates.includes(state)) return;
    patch({
      professionalTax: {
        ...draft.professionalTax,
        schedules: [...draft.professionalTax.schedules, reference],
      },
    });
  }

  function removeSchedule(state: string) {
    patch({
      professionalTax: {
        ...draft.professionalTax,
        schedules: draft.professionalTax.schedules.filter((schedule) => schedule.state !== state),
        // The mappings that pointed at it go too. A location mapped to a state
        // with no schedule deducts nothing, which is correct, but leaving it
        // there presents as a mapping that works.
        stateByLocation: Object.fromEntries(
          Object.entries(draft.professionalTax.stateByLocation).filter(([, s]) => s !== state),
        ),
      },
    });
  }

  function mapLocation(location: string, state: string) {
    const next = { ...draft.professionalTax.stateByLocation };
    if (state) next[location] = state;
    else delete next[location];
    patch({ professionalTax: { ...draft.professionalTax, stateByLocation: next } });
  }

  const anythingOn =
    draft.epf.enabled || draft.esi.enabled || draft.professionalTax.enabled || draft.incomeTax.enabled;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Payroll Compliance</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            The statutory schemes this organisation is registered for. Nothing is withheld from
            anybody&rsquo;s salary until it is declared here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving === 'saved' && (
            <span className="flex items-center gap-1 text-sm text-emerald-600 whitespace-nowrap">
              <Check size={14} /> Saved
            </span>
          )}
          {saving === 'saving' && <span className="text-sm text-ink-500">Saving…</span>}
          {saving === 'failed' && (
            <span className="flex items-center gap-1 text-sm text-amber-700">
              <AlertCircle size={14} className="shrink-0" /> Not saved to your organisation
            </span>
          )}
          <Button onClick={save} disabled={!dirty || saving === 'saving'}>
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 border border-brand-600 bg-brand-50 px-4 py-3 text-sm text-ink-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-brand-600" />
          <span>{error}</span>
        </div>
      )}

      {!stored && (
        <div className="mb-4 border border-ink-300 bg-ink-100 px-4 py-3 text-sm text-ink-700">
          <p className="font-medium text-ink-900">Nothing is set up yet.</p>
          <p className="mt-1 leading-relaxed">
            Until a scheme is switched on below, a payslip is the month&rsquo;s gross less unpaid
            absence and nothing else — no provident fund, no ESI, no professional tax and no tax
            deducted at source. That is deliberate: this app will not deduct money from anybody
            under a scheme its employer has not told it about.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* ---- EPF -------------------------------------------------------- */}
        <Card>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="font-semibold text-ink-900">Employees&rsquo; Provident Fund</h3>
              <p className="text-sm text-ink-500">Deducted on the Basic component, not on gross.</p>
            </div>
            {draft.epf.enabled && <Badge tone="green" dot>On</Badge>}
          </div>

          <Row label="Registered" hint="Off until an establishment code is recorded.">
            <Toggle
              on={draft.epf.enabled}
              label="This establishment is covered by the EPF Act"
              onChange={(enabled) => patch({ epf: { ...draft.epf, enabled } })}
            />
          </Row>

          <Row label="Establishment code" hint="Appears on every ECR.">
            <input
              className="input"
              placeholder="e.g. KN/BNG/0012345/000"
              value={draft.epf.establishmentCode}
              onChange={(event) => patch({ epf: { ...draft.epf, establishmentCode: event.target.value } })}
            />
          </Row>

          <Row
            label="Contribution base"
            hint="Both are lawful and organisations do both, so this app cannot pick."
          >
            <Select
              ariaLabel="EPF contribution base"
              value={draft.epf.restrictToWageCeiling ? 'ceiling' : 'full'}
              onChange={(value) =>
                patch({ epf: { ...draft.epf, restrictToWageCeiling: value === 'ceiling' } })
              }
              options={[
                {
                  value: 'ceiling',
                  label: `Restricted to the ₹${INDIA_STATUTORY_RATES.epf.wageCeiling.toLocaleString('en-IN')} ceiling`,
                },
                { value: 'full', label: 'On the whole Basic, however high' },
              ]}
            />
            <RateNote>
              Employee {INDIA_STATUTORY_RATES.epf.employeePercent}%, employer{' '}
              {INDIA_STATUTORY_RATES.epf.employerPercent}% of which{' '}
              {INDIA_STATUTORY_RATES.epf.pensionPercent}% is pension. The pension share is capped at
              the ceiling whichever base is chosen — that cap is statutory, not a setting.
            </RateNote>
          </Row>

          <Row
            label="Employer share"
            hint="Decides whether switching EPF on lowers anybody's gross."
          >
            <Select
              ariaLabel="Where the employer's share sits"
              value={draft.epf.employerShareInCtc ? 'inside' : 'ontop'}
              onChange={(value) =>
                patch({ epf: { ...draft.epf, employerShareInCtc: value === 'inside' } })
              }
              options={[
                { value: 'inside', label: 'Inside the CTC offered — gross is CTC less the employer’s share' },
                { value: 'ontop', label: 'On top of the CTC — gross stays CTC ÷ 12' },
              ]}
            />
            <p className="text-xs text-ink-500 mt-2 leading-relaxed">
              This is the only setting on this page that changes what somebody is paid rather than
              what is withheld from it. <strong>Inside</strong> means the ₹6,00,000 you offered
              already included the employer&rsquo;s contribution, so the salary is lower by exactly
              that. <strong>On top</strong> leaves every gross where it is today.
            </p>
          </Row>
        </Card>

        {/* ---- ESI -------------------------------------------------------- */}
        <Card>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="font-semibold text-ink-900">Employees&rsquo; State Insurance</h3>
              <p className="text-sm text-ink-500">Deducted on the month&rsquo;s gross, up to the wage threshold.</p>
            </div>
            {draft.esi.enabled && <Badge tone="green" dot>On</Badge>}
          </div>

          <Row label="Registered">
            <Toggle
              on={draft.esi.enabled}
              label="This establishment is covered by the ESI Act"
              onChange={(enabled) => patch({ esi: { ...draft.esi, enabled } })}
            />
          </Row>

          <Row label="Establishment code">
            <input
              className="input"
              placeholder="e.g. 53000123450000999"
              value={draft.esi.establishmentCode}
              onChange={(event) => patch({ esi: { ...draft.esi, establishmentCode: event.target.value } })}
            />
            <RateNote>
              Employee {INDIA_STATUTORY_RATES.esi.employeePercent}%, employer{' '}
              {INDIA_STATUTORY_RATES.esi.employerPercent}%, for anybody earning up to ₹
              {INDIA_STATUTORY_RATES.esi.wageThreshold.toLocaleString('en-IN')} a month (₹
              {INDIA_STATUTORY_RATES.esi.disabilityWageThreshold.toLocaleString('en-IN')} where a
              disability is recorded). Both shares round up to the next rupee, which is ESIC&rsquo;s
              own rule.
            </RateNote>
            <p className="text-xs text-amber-700 mt-2 leading-relaxed">
              <AlertCircle size={12} className="inline mr-1 -mt-0.5" />
              Coverage is decided at the start of each contribution period (April and October) and
              holds until it ends. This app tests the threshold each month instead, so somebody
              whose pay crosses it mid-period will stop contributing a period early. Correct it on
              their record until that carries forward on its own.
            </p>
          </Row>
        </Card>

        {/* ---- Professional tax ------------------------------------------- */}
        <Card>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="font-semibold text-ink-900">Professional Tax</h3>
              <p className="text-sm text-ink-500">
                A state levy. Deducted under the schedule of the state somebody works in.
              </p>
            </div>
            {draft.professionalTax.enabled && <Badge tone="green" dot>On</Badge>}
          </div>

          <Row label="Deducting">
            <Toggle
              on={draft.professionalTax.enabled}
              label="This organisation deducts professional tax"
              onChange={(enabled) =>
                patch({ professionalTax: { ...draft.professionalTax, enabled } })
              }
            />
          </Row>

          <Row label="State schedules" hint="Confirm each against that state's current notification.">
            {draft.professionalTax.schedules.length === 0 ? (
              <p className="text-sm text-ink-500">No schedule declared, so nothing is deducted.</p>
            ) : (
              <div className="space-y-3">
                {draft.professionalTax.schedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.state}
                    schedule={schedule}
                    onRemove={() => removeSchedule(schedule.state)}
                  />
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.1em] text-ink-500">Add a reference schedule</span>
              {REFERENCE_PROFESSIONAL_TAX.filter((s) => !declaredStates.includes(s.state)).map((s) => (
                <Button
                  key={s.state}
                  variant="secondary"
                  className="text-xs py-1"
                  onClick={() => addReferenceSchedule(s.state)}
                >
                  <Plus size={12} className="mr-1" /> {s.state}
                </Button>
              ))}
            </div>
            <p className="text-xs text-ink-500 mt-2 leading-relaxed">
              These are a starting point, not the answer. Professional tax is notified by each state
              independently and this app cannot know which notification is current where you
              operate — so the slabs are editable and each carries the month it was last checked.
              A state that is not listed here is one nobody has checked; type its slabs rather than
              borrowing a neighbour&rsquo;s.
            </p>
          </Row>

          <Row label="Which state each location is in" hint="An unmapped location deducts nothing.">
            {locations.length === 0 ? (
              <p className="text-sm text-ink-500">This organisation has no work locations yet.</p>
            ) : (
              <div className="space-y-2">
                {locations.map((location) => (
                  <div key={location} className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-700">
                      <MapPin size={13} className="shrink-0 text-ink-400" />
                      <span className="truncate">{location}</span>
                    </span>
                    <Select
                      className="w-56"
                      ariaLabel={`State for ${location}`}
                      value={draft.professionalTax.stateByLocation[location] ?? ''}
                      onChange={(value) => mapLocation(location, value)}
                      options={[
                        { value: '', label: 'Not mapped — no deduction' },
                        ...declaredStates.map((state) => ({ value: state, label: state })),
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
            {draft.professionalTax.enabled && unmappedLocations.length > 0 && (
              <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                <AlertCircle size={12} className="inline mr-1 -mt-0.5" />
                Nobody at {unmappedLocations.join(', ')} has professional tax deducted. That is the
                safe direction for a missing answer — another state&rsquo;s slab would simply be a
                wrong deduction — but it is a gap, not a decision, until you make it one.
              </p>
            )}
          </Row>
        </Card>

        {/* ---- TDS -------------------------------------------------------- */}
        <Card>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h3 className="font-semibold text-ink-900">Tax Deducted at Source</h3>
              <p className="text-sm text-ink-500">
                The year&rsquo;s liability, spread over the months that remain in it.
              </p>
            </div>
            {draft.incomeTax.enabled && <Badge tone="green" dot>On</Badge>}
          </div>

          <Row label="Withholding">
            <Toggle
              on={draft.incomeTax.enabled}
              label="This employer deducts tax at source on salaries"
              onChange={(enabled) => patch({ incomeTax: { ...draft.incomeTax, enabled } })}
            />
          </Row>

          <Row label="TAN" hint="On every challan and every quarterly return.">
            <input
              className="input"
              placeholder="e.g. BLRM12345C"
              value={draft.incomeTax.tan}
              onChange={(event) => patch({ incomeTax: { ...draft.incomeTax, tan: event.target.value } })}
            />
          </Row>

          <Row label="Default regime" hint="Applied to anybody who has not elected one.">
            <Select
              ariaLabel="Default tax regime"
              value={draft.incomeTax.defaultRegime}
              onChange={(value) =>
                patch({
                  incomeTax: { ...draft.incomeTax, defaultRegime: value === 'old' ? 'old' : 'new' },
                })
              }
              options={[
                { value: 'new', label: 'New regime' },
                { value: 'old', label: 'Old regime' },
              ]}
            />
            <RateNote>
              New regime: standard deduction ₹
              {INDIA_STATUTORY_RATES.incomeTax.newRegime.standardDeduction.toLocaleString('en-IN')},
              nothing payable up to ₹
              {INDIA_STATUTORY_RATES.incomeTax.newRegime.rebateIncomeCeiling.toLocaleString('en-IN')}{' '}
              taxable under §87A, then the slabs, plus{' '}
              {INDIA_STATUTORY_RATES.incomeTax.cessPercent}% cess and surcharge above ₹50,00,000.
            </RateNote>
            <p className="text-xs text-ink-500 mt-2 leading-relaxed">
              The month&rsquo;s deduction is projected from the month&rsquo;s gross annualised — the
              only estimate an employer can make in April — and corrects itself as soon as the
              figure moves, because what has already been withheld is credited against the rest of
              the year. Investment declarations are recorded per employee and only apply under the
              old regime; allowing them under the new one would under-deduct all year and land as a
              demand on the employee.
            </p>
          </Row>
        </Card>

        {/* ---- Code on Wages ---------------------------------------------- */}
        <Card>
          <h3 className="font-semibold text-ink-900">Code on Wages floor</h3>
          <p className="text-sm text-ink-500 mb-2">
            A check on the salary structure, not a deduction.
          </p>
          <Row label="Checking">
            <Toggle
              on={draft.enforceWageFloor}
              label="Warn when Basic falls below half of total remuneration"
              onChange={(enforceWageFloor) => patch({ enforceWageFloor })}
            />
            <p className="text-xs text-ink-500 mt-2 leading-relaxed">
              The Code defines wages as basic plus dearness allowance and provides that where the
              excluded allowances exceed half of total remuneration, the excess is added back — so
              provident fund and gratuity are owed on at least 50% however the structure is drawn.
              Settings → Salary Structure accepts any Basic percentage, so without this check an
              organisation can configure itself into under-contributing and no surface says so.
              It is reported and never applied: recomputing everybody&rsquo;s PF on a figure the
              company did not agree to is not this app&rsquo;s decision to make.
            </p>
          </Row>
        </Card>
      </div>

      {anythingOn && (
        <p className="text-xs text-ink-500 mt-4 leading-relaxed flex items-start gap-2">
          <IndianRupee size={13} className="mt-0.5 shrink-0 text-ink-400" />
          <span>
            These rates were last checked in {ratesCheckedAt}. A rate that has moved since produces
            a payslip that looks exactly like a correct one, so check them against the current
            notifications before the first run of a new financial year.
          </span>
        </p>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule,
  onRemove,
}: {
  schedule: ProfessionalTaxSchedule;
  onRemove: () => void;
}) {
  return (
    <div className="border border-ink-200 bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-900">{schedule.state}</span>
          <span className="text-[11px] uppercase tracking-[0.1em] text-ink-400">
            checked {schedule.checkedAgainst}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-400 hover:text-brand-600"
          aria-label={`Remove the ${schedule.state} schedule`}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {schedule.slabs.map((slab, index) => (
            <tr key={index} className="border-t border-ink-200 first:border-t-0">
              <td className="py-1 text-ink-600">
                {slab.upTo === null
                  ? 'Above the band before it'
                  : `Up to ₹${slab.upTo.toLocaleString('en-IN')}`}
              </td>
              <td className="py-1 text-right tabular-nums text-ink-900">
                ₹{slab.amount.toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
          {schedule.februaryAmount !== undefined && (
            <tr className="border-t border-ink-200">
              <td className="py-1 text-ink-600">February, top band</td>
              <td className="py-1 text-right tabular-nums text-ink-900">
                ₹{schedule.februaryAmount.toLocaleString('en-IN')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
