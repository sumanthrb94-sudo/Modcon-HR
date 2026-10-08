import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Download, FileUp, Loader2 } from 'lucide-react';
import { Badge, Button, Card, PageHeader, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useWorkspaceLocked } from '@/lib/subscription';
import { todayIso } from '@/lib/today';
import { cn } from '@/lib/utils';
import { getCompanyProfile, saveCompanyProfile, TEAM_SIZE_BANDS } from '@/data/companyProfile';
import { getEmployeeDirectory, suggestEmployeeCode } from '@/data/employees';
import { createEmployeeFromDetails } from '@/data/createEmployee';
import {
  EMPLOYEE_IMPORT_CSV_EXAMPLE,
  EMPLOYEE_IMPORT_CSV_HEADER,
  parseEmployeeImportCsv,
  type EmployeeImportResult,
} from '@/data/employeeImport';
import { getLeavePolicies, inheritedDemoPolicies, saveLeavePolicies } from '@/data/leavePolicies';
import { describeGrant, LEAVE_POLICY_TEMPLATES } from '@/data/leavePolicyTemplates';
import { getDeclaredOrganisationWeekOff, saveOrganisationWeekOff } from '@/data/weekOff';
import { getOrganisationTasks } from '@/data/gettingStarted';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { WEEK_OFF_DAYS, type WeekOffDay } from '@/types';

/**
 * The guided setup: company → people → policy → live.
 *
 * ## Why a sequence, when the checklist already exists
 *
 * The Getting Started checklist lists ten things in any order, which is right
 * for somebody coming back to finish, and wrong for somebody on their first
 * five minutes: they need to be told what comes first. This walks the four
 * that decide whether the app does anything at all — who the company is, who
 * works there, which day is off and how leave is earned — and hands the rest
 * (holidays, salary split, statutory registrations) to the checklist at the end
 * rather than pretending they are optional.
 *
 * ## It writes through the same functions everything else does
 *
 * `saveCompanyProfile`, `createEmployeeFromDetails`, `saveOrganisationWeekOff`
 * and `saveLeavePolicies` — so a person imported here is linked to their
 * account and granted HR access exactly as Add Employee would, and every
 * setting lands in the organisation's Firestore copy, not this browser's.
 *
 * ## It keeps no progress of its own
 *
 * Each step opens on what is already saved, so leaving halfway and coming back
 * resumes rather than restarts, and finishing a step in Settings instead is
 * just as finished. Same reasoning as `data/gettingStarted.ts`.
 */

type StepId = 'company' | 'people' | 'policy' | 'live';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'people', label: 'People' },
  { id: 'policy', label: 'Week off & leave' },
  { id: 'live', label: 'Live' },
];

/** The leave choice: a template, what the organisation already has, or nothing yet. */
type LeaveChoice = string | 'keep' | 'later';

function StepRail({ current }: { current: StepId }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="mb-6 grid grid-cols-4 border-2 border-ink-900" aria-label="Setup progress">
      {STEPS.map((step, i) => (
        <li
          key={step.id}
          aria-current={i === index ? 'step' : undefined}
          className={cn(
            'flex min-w-0 items-center gap-2 px-2 py-2.5 text-xs font-semibold sm:px-3',
            i > 0 && 'border-l-2 border-ink-900',
            i === index ? 'bg-ink-900 text-ink-50' : i < index ? 'bg-ink-100 text-ink-700' : 'text-ink-500',
          )}
        >
          <span className="tabular-nums">{i < index ? <Check size={12} /> : `0${i + 1}`}</span>
          <span className="truncate">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function SaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-4 border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
      {message}
    </p>
  );
}

export function SetupPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const workspaceLocked = useWorkspaceLocked();
  const directoryRevision = useEmployeeDirectoryRevision();
  const [step, setStep] = useState<StepId>('company');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- step 1: company ------------------------------------------------------
  const initialCompany = useMemo(() => getCompanyProfile(), []);
  const [companyName, setCompanyName] = useState(initialCompany.name);
  const [legalName, setLegalName] = useState(initialCompany.legalName);
  const [teamSize, setTeamSize] = useState(initialCompany.teamSize);

  // ---- step 2: people -------------------------------------------------------
  const directory = useMemo(() => getEmployeeDirectory(), [directoryRevision]);
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const preview: EmployeeImportResult | null = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseEmployeeImportCsv(
      csvText,
      directory.map((employee) => ({ email: employee.email, employeeCode: employee.employeeCode })),
      (ahead) => suggestEmployeeCode(directory, ahead),
      todayIso(),
    );
  }, [csvText, directory]);

  // ---- step 3: week off & leave ---------------------------------------------
  const [weekOff, setWeekOff] = useState<WeekOffDay>(() => getDeclaredOrganisationWeekOff() ?? 'Sunday');
  const existingPolicies = useMemo(() => {
    const policies = getLeavePolicies();
    // Borrowed demo copies are not this organisation's policy, so they are not
    // offered as "keep what you have".
    const borrowed = new Set(inheritedDemoPolicies(policies).map((policy) => policy.id));
    return policies.filter((policy) => !borrowed.has(policy.id));
  }, []);
  const [leaveChoice, setLeaveChoice] = useState<LeaveChoice>(() =>
    existingPolicies.length > 0 ? 'keep' : LEAVE_POLICY_TEMPLATES[0].id,
  );

  // ---- step 4: live ---------------------------------------------------------
  const remainingTasks = useMemo(
    () => (step === 'live' ? getOrganisationTasks().filter((task) => !task.done) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, directoryRevision],
  );

  function go(next: StepId) {
    setError(null);
    setStep(next);
    window.scrollTo?.({ top: 0 });
  }

  async function saveCompany() {
    if (!companyName.trim()) {
      setError('Enter the name your people know the company by.');
      return;
    }
    const current = getCompanyProfile();
    const nextLegalName = legalName.trim() || companyName.trim();
    // Nothing changed is nothing to write. Coming back through the setup to
    // reach a later step should not re-publish a profile somebody else may
    // have edited in Settings since this page loaded.
    if (current.name === companyName.trim() && current.legalName === nextLegalName && current.teamSize === teamSize) {
      go('people');
      return;
    }
    setSaving(true);
    const published = await saveCompanyProfile({
      ...current,
      name: companyName.trim(),
      // The legal name is what payslips print; most small companies' is the
      // trading name plus "Private Limited", so an empty one takes the name
      // rather than leaving the payslip blank. Settings can correct it.
      legalName: nextLegalName,
      teamSize,
    });
    setSaving(false);
    if (!published) {
      setError('This was saved in this browser but not to your organisation. Check your connection and press Continue again.');
      return;
    }
    go('people');
  }

  async function readFile(file: File) {
    setFileName(file.name);
    setImported(null);
    setCsvText(await file.text());
  }

  function downloadTemplate() {
    const blob = new Blob([`${EMPLOYEE_IMPORT_CSV_HEADER}\n${EMPLOYEE_IMPORT_CSV_EXAMPLE}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modcon-hr-employees.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function importPeople() {
    if (!preview || preview.rows.length === 0) return;
    const collected: string[] = [];
    const notify = (message: string) => {
      collected.push(message);
      setNotices([...collected]);
    };
    for (const { employee } of preview.rows) {
      const { codeSuggested: _codeSuggested, ...details } = employee;
      createEmployeeFromDetails({ ...details, reportingManagerId: null }, { profile, notify });
    }
    setImported(preview.rows.length);
    setCsvText('');
    setFileName(null);
  }

  async function savePolicy() {
    setSaving(true);
    const writes: Promise<boolean>[] = [];
    // Pressing Continue on an undeclared week-off *is* the declaration, so
    // only an unchanged, already-declared day is skipped.
    if (getDeclaredOrganisationWeekOff() !== weekOff) writes.push(saveOrganisationWeekOff(weekOff));
    const template = LEAVE_POLICY_TEMPLATES.find((item) => item.id === leaveChoice);
    if (template) writes.push(saveLeavePolicies(template.policies));
    const results = await Promise.all(writes);
    setSaving(false);
    if (results.some((ok) => !ok)) {
      setError('This was saved in this browser but not to your organisation. Check your connection and press Continue again.');
      return;
    }
    go('live');
  }

  if (workspaceLocked) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Set up your workspace" />
        <Card>
          <p className="text-sm text-ink-700">
            Setup is paused until billing is arranged. Your records are all still readable — see{' '}
            <Link to="/settings?tab=billing" className="font-semibold text-brand-700 hover:underline">
              Settings → Billing
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Set up your workspace"
        subtitle="Four steps, about five minutes. Everything here can be changed later in Settings."
      />
      <StepRail current={step} />

      {step === 'company' && (
        <Card>
          <h2 className="font-display text-lg font-extrabold text-ink-900">Your company</h2>
          <p className="mt-1 text-sm text-ink-600">The name your people see, and the one printed on their payslips.</p>
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="setup-company-name" className="label">Company name</label>
              <input
                id="setup-company-name"
                className="input"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Sharma Engineering"
              />
            </div>
            <div>
              <label htmlFor="setup-legal-name" className="label">Legal name (on payslips)</label>
              <input
                id="setup-legal-name"
                className="input"
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                placeholder="Sharma Engineering Private Limited"
              />
              <p className="mt-1 text-xs text-ink-500">Left blank, the company name is used.</p>
            </div>
            <div>
              <span className="label">How many people work here?</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team size">
                {TEAM_SIZE_BANDS.map((band) => (
                  <button
                    key={band}
                    type="button"
                    role="radio"
                    aria-checked={teamSize === band}
                    onClick={() => setTeamSize(band)}
                    className={cn(
                      'border-2 px-3 py-1.5 text-sm font-semibold',
                      teamSize === band ? 'border-ink-900 bg-ink-900 text-ink-50' : 'border-ink-300 text-ink-800 hover:border-ink-900',
                    )}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SaveError message={error} />
          <div className="mt-6 flex justify-end">
            <Button onClick={() => void saveCompany()} disabled={saving} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
              Continue <ArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      {step === 'people' && (
        <Card>
          <h2 className="font-display text-lg font-extrabold text-ink-900">Bring in your people</h2>
          <p className="mt-1 text-sm text-ink-600">
            Export your staff list from Excel or Google Sheets as a CSV. Columns are matched by their heading, in any order.
            {directory.length > 0 && (
              <> Your directory already has <strong>{directory.length}</strong> {directory.length === 1 ? 'person' : 'people'}; anyone in the file who is already there is skipped and listed.</>
            )}
          </p>

          {teamSize === '1–9' && (
            <p className="mt-3 text-sm text-ink-600">
              With fewer than ten people it may be quicker to add them one at a time from{' '}
              <Link to="/employees" className="font-semibold text-brand-700 hover:underline">Employees → Add Employee</Link>.
            </p>
          )}

          <div className="mt-4 border border-ink-300 bg-ink-100 px-4 py-3 text-xs leading-relaxed text-ink-700">
            <p>
              <strong>Needed for everyone:</strong> first and last name, work email, designation, department, location,
              date of birth, date of joining and annual CTC. Optional: employment type, gender, phone, employee code
              (one is suggested if blank). Dates as YYYY-MM-DD or DD/MM/YYYY.
            </p>
            <button type="button" onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              <Download size={12} /> Download a template
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Employee CSV file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} icon={<FileUp size={14} />}>
              Choose CSV file
            </Button>
            {fileName && <span className="text-sm text-ink-600">{fileName}</span>}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink-600">Or paste the rows instead</summary>
            <textarea
              className="input mt-2 h-32 font-mono text-xs"
              aria-label="Employee CSV rows"
              value={csvText}
              onChange={(event) => {
                setImported(null);
                setCsvText(event.target.value);
              }}
              placeholder={`${EMPLOYEE_IMPORT_CSV_HEADER}\n${EMPLOYEE_IMPORT_CSV_EXAMPLE}`}
            />
          </details>

          {preview?.fileError && <SaveError message={preview.fileError} />}

          {preview && !preview.fileError && (
            <div className="mt-5 space-y-4">
              {preview.rows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {preview.rows.length} {preview.rows.length === 1 ? 'person' : 'people'} ready to add
                  </p>
                  <div className="mt-2 max-h-64 overflow-auto border border-ink-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-ink-100 text-ink-600">
                        <tr>
                          <th className="px-2 py-1.5 font-semibold">Code</th>
                          <th className="px-2 py-1.5 font-semibold">Name</th>
                          <th className="px-2 py-1.5 font-semibold">Email</th>
                          <th className="px-2 py-1.5 font-semibold">Department</th>
                          <th className="px-2 py-1.5 font-semibold">Designation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map(({ line, employee }) => (
                          <tr key={line} className="border-t border-ink-200">
                            <td className="px-2 py-1.5 tabular-nums">
                              {employee.employeeCode}
                              {employee.codeSuggested && <span className="ml-1 text-ink-400">(suggested)</span>}
                            </td>
                            <td className="px-2 py-1.5">{employee.firstName} {employee.lastName}</td>
                            <td className="px-2 py-1.5 break-all">{employee.email}</td>
                            <td className="px-2 py-1.5">{employee.department}</td>
                            <td className="px-2 py-1.5">{employee.designation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.unmatched.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-rose-800">
                    {preview.unmatched.length} {preview.unmatched.length === 1 ? 'row' : 'rows'} will not be added
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-ink-700">
                    {preview.unmatched.map((miss) => (
                      <li key={miss.line}>
                        <span className="font-semibold">Line {miss.line}:</span> {miss.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-500">Fix these in your spreadsheet and choose the file again — the people above are not affected.</p>
                </div>
              )}

              {preview.rows.length > 0 && (
                <Button onClick={importPeople}>
                  Add {preview.rows.length} {preview.rows.length === 1 ? 'person' : 'people'}
                </Button>
              )}
            </div>
          )}

          {imported !== null && (
            <p role="status" className="mt-4 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Added {imported} {imported === 1 ? 'person' : 'people'}. Reporting managers are set from each person&rsquo;s profile.
            </p>
          )}
          {notices.length > 0 && (
            <ul className="mt-3 space-y-1 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {notices.map((notice, index) => (
                <li key={index}>{notice}</li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go('company')} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
            <Button variant={directory.length > 0 ? 'primary' : 'secondary'} onClick={() => go('policy')}>
              {directory.length > 0 ? 'Continue' : 'Skip — I’ll add people later'} <ArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      {step === 'policy' && (
        <Card>
          <h2 className="font-display text-lg font-extrabold text-ink-900">Week off and leave</h2>
          <p className="mt-1 text-sm text-ink-600">
            The week off decides which day is never marked absent. Leave decides what people can take before it becomes unpaid.
          </p>

          <div className="mt-5 max-w-xs">
            <span className="label">Weekly day off</span>
            <Select
              ariaLabel="Weekly day off"
              value={weekOff}
              onChange={(value) => setWeekOff(value as WeekOffDay)}
              options={WEEK_OFF_DAYS.map((day) => ({ label: day, value: day }))}
            />
            <p className="mt-1 text-xs text-ink-500">Anyone with a different day can be given their own on their profile.</p>
          </div>

          <fieldset className="mt-6">
            <legend className="label">Leave policy</legend>
            <div className="space-y-3">
              {existingPolicies.length > 0 && (
                <LeaveOption
                  checked={leaveChoice === 'keep'}
                  onSelect={() => setLeaveChoice('keep')}
                  title="Keep the policy you already have"
                  summary={`${existingPolicies.length} leave ${existingPolicies.length === 1 ? 'type' : 'types'}: ${existingPolicies.map((policy) => policy.type).join(', ')}.`}
                />
              )}
              {LEAVE_POLICY_TEMPLATES.map((template) => (
                <LeaveOption
                  key={template.id}
                  checked={leaveChoice === template.id}
                  onSelect={() => setLeaveChoice(template.id)}
                  title={template.name}
                  summary={template.summary}
                >
                  <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-xs text-ink-700 sm:grid-cols-2">
                    {template.policies.map((policy) => (
                      <li key={policy.id}>
                        <span className="font-semibold">{policy.type}:</span> {describeGrant(policy)}
                      </li>
                    ))}
                  </ul>
                </LeaveOption>
              ))}
              <LeaveOption
                checked={leaveChoice === 'later'}
                onSelect={() => setLeaveChoice('later')}
                title="I’ll set leave up myself"
                summary="Nothing is granted until you do — every request is against a balance of zero. Settings → Leave Policies."
              />
            </div>
            {existingPolicies.length > 0 && leaveChoice !== 'keep' && leaveChoice !== 'later' && (
              <p className="mt-3 text-xs font-semibold text-amber-800">
                This replaces your current leave types with the template&rsquo;s.
              </p>
            )}
          </fieldset>

          <SaveError message={error} />
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go('people')} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
            <Button onClick={() => void savePolicy()} disabled={saving} icon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
              Continue <ArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      {step === 'live' && (
        <Card>
          <h2 className="font-display text-lg font-extrabold text-ink-900">You&rsquo;re live</h2>
          <p className="mt-1 text-sm text-ink-600">
            Attendance and leave work from today. Two things are worth doing next:
          </p>
          <ol className="mt-4 space-y-2 text-sm text-ink-800">
            <li>
              <strong>1. Give people their logins.</strong> Open someone on <em>Employees</em> and press <em>Create login</em> — they are emailed a link to set their own password.
            </li>
            <li>
              <strong>2. Set who reports to whom</strong>, from each person&rsquo;s profile, so leave requests reach the right manager. Until then they come to HR.
            </li>
          </ol>

          {remainingTasks.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-ink-900">Still to set up before your first payroll</p>
              <ul className="mt-2 divide-y divide-ink-200 border border-ink-200">
                {remainingTasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">
                        {task.title}
                        {task.optional && <Badge tone="gray" className="ml-2">optional</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-600">{task.why}</p>
                    </div>
                    <Link to={task.href} className="shrink-0 self-center text-xs font-semibold text-brand-700 hover:underline">
                      Open <ArrowRight size={12} className="inline" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go('policy')} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate('/employees')}>
                Give people logins
              </Button>
              <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function LeaveOption({
  checked,
  onSelect,
  title,
  summary,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  summary: string;
  children?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'block cursor-pointer border-2 px-4 py-3',
        checked ? 'border-ink-900 bg-ink-100' : 'border-ink-200 hover:border-ink-400',
      )}
    >
      <span className="flex items-start gap-3">
        <input type="radio" name="leave-choice" checked={checked} onChange={onSelect} className="mt-1 accent-brand-600" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-600">{summary}</span>
          {children}
        </span>
      </span>
    </label>
  );
}
