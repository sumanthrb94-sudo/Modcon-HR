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
import { HR_DEPARTMENT } from '@/data/companyProfile';
import { updateEmployeeInDirectory } from '@/data/employees';
import { isInventedAdminRecord } from '@/data/payRun';
import { resolveEmployeeForAccount } from '@/lib/currentEmployee';
import {
  EmployeeDetailsFields,
  emptyDetailsDraft,
  toEmployeeDetails,
  useEmployeeDetailsForm,
  type EmployeeDetailsDraft,
} from '@/components/EmployeeDetailsForm';
import {
  EMPLOYEE_IMPORT_CSV_EXAMPLE,
  EMPLOYEE_IMPORT_CSV_HEADER,
  parseEmployeeImportCsv,
  type EmployeeImportResult,
} from '@/data/employeeImport';
import { getLeavePolicies, inheritedDemoPolicies, saveLeavePolicies } from '@/data/leavePolicies';
import { describeGrant, LEAVE_POLICY_TEMPLATES } from '@/data/leavePolicyTemplates';
import {
  getDeclaredOrganisationWeekOff,
  getOrganisationWeekOffRules,
  saveOrganisationWeekOff,
  saveOrganisationWeekOffRules,
} from '@/data/weekOff';
import type { WeekOffRules } from '@/data/weekOffRules';
import { getOrganisationTasks } from '@/data/gettingStarted';
import { syncManagerChains } from '@/lib/reportingChains';
import type { Employee } from '@/types';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { WEEK_OFF_DAYS, type WeekOffDay } from '@/types';
import { findIndustryPreset, INDUSTRY_PRESETS, type IndustryPreset } from '@/data/industryPresets';
import {
  getEnabledModules,
  MODULE_DESCRIPTIONS,
  OPTIONAL_MODULES,
  saveEnabledModules,
  type OptionalModule,
} from '@/lib/moduleSwitches';

/**
 * The guided setup: company → you → people → policy → live.
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

type StepId = 'company' | 'you' | 'people' | 'policy' | 'live';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'you', label: 'You' },
  { id: 'people', label: 'People' },
  { id: 'policy', label: 'Week off & leave' },
  { id: 'live', label: 'Live' },
];

/** How an office treats Saturdays — the question most Indian offices answer differently. */
type SaturdayChoice = 'worked' | 'all' | '2,4' | '1,3' | 'custom';
const SATURDAY_CHOICES: { id: SaturdayChoice; label: string }[] = [
  { id: 'worked', label: 'Working day' },
  { id: 'all', label: 'Every Saturday off' },
  { id: '2,4', label: '2nd and 4th Saturday off' },
  { id: '1,3', label: '1st and 3rd Saturday off' },
];

function saturdayChoiceOf(rules: WeekOffRules): SaturdayChoice {
  if (rules.secondDay === 'Saturday' && !rules.nthDays) return 'all';
  if (!rules.secondDay && rules.nthDays?.day === 'Saturday') {
    const key = rules.nthDays.weeks.join(',');
    if (key === '2,4' || key === '1,3') return key;
  }
  return rules.secondDay || rules.nthDays ? 'custom' : 'worked';
}

function saturdayRules(choice: SaturdayChoice, current: WeekOffRules): WeekOffRules {
  if (choice === 'custom') return current;
  if (choice === 'worked') return { secondDay: null, nthDays: null };
  if (choice === 'all') return { secondDay: 'Saturday', nthDays: null };
  return { secondDay: null, nthDays: { day: 'Saturday', weeks: choice.split(',').map(Number) } };
}

/** The leave choice: a template, what the organisation already has, or nothing yet. */
type LeaveChoice = string | 'keep' | 'later';

function StepRail({ current }: { current: StepId }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="mb-6 grid grid-cols-5 border-2 border-ink-900" aria-label="Setup progress">
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
  // Defaults to today: the day somebody runs the setup is, nearly always, the
  // day the company starts recording here. See data/goLive.ts.
  const [goLiveDate, setGoLiveDate] = useState(initialCompany.goLiveDate || todayIso());
  // Stored as the preset's label in the profile's free-text `industry`, so a
  // value typed in Settings that matches no preset is simply not preselected.
  const [industry, setIndustry] = useState<IndustryPreset | undefined>(() => findIndustryPreset(initialCompany.industry));

  // ---- step 2: you ----------------------------------------------------------
  // Who this account already is in the directory, if anybody. A record an
  // earlier version invented is not anybody: its figures are offered for
  // correction, never kept — see isInventedAdminRecord.
  const me = useMemo(
    () => resolveEmployeeForAccount(profile, getEmployeeDirectory()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, directoryRevision],
  );
  const meInvented = isInventedAdminRecord(me);
  const meForm = useEmployeeDetailsForm((): EmployeeDetailsDraft => {
    const draft = emptyDetailsDraft();
    const nameParts = (profile?.displayName ?? '').trim().split(/\s+/).filter(Boolean);
    return {
      ...draft,
      employeeCode: me?.employeeCode ?? draft.employeeCode,
      firstName: me?.firstName ?? nameParts[0] ?? '',
      lastName: me?.lastName ?? nameParts.slice(1).join(' '),
      email: profile?.email ?? '',
      designation: me?.designation ?? '',
      department: HR_DEPARTMENT,
    };
  });
  const [showMeErrors, setShowMeErrors] = useState(false);
  const [meNotice, setMeNotice] = useState<string | null>(null);

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
      directory.map((employee) => ({
        id: employee.id,
        email: employee.email,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
      })),
      (ahead) => suggestEmployeeCode(directory, ahead),
      todayIso(),
    );
  }, [csvText, directory]);

  // ---- step 3: week off & leave ---------------------------------------------
  const [weekOff, setWeekOff] = useState<WeekOffDay>(() => getDeclaredOrganisationWeekOff() ?? 'Sunday');
  const initialRules = useMemo(() => getOrganisationWeekOffRules(), []);
  const [saturdays, setSaturdays] = useState<SaturdayChoice>(() => saturdayChoiceOf(initialRules));
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

  const [modules, setModules] = useState<OptionalModule[]>(() => getEnabledModules());

  /**
   * Choosing an industry moves the later steps' answers to its defaults — on
   * screen, not saved. The administrator sees them on the next steps and
   * changes whatever does not fit; only what they then press Continue on is
   * written. An organisation that already has its own leave policy keeps
   * "keep what you have" selected: a preset is a starting point, not a reason
   * to replace a policy somebody chose.
   */
  function chooseIndustry(preset: IndustryPreset) {
    setIndustry(preset);
    if (!getDeclaredOrganisationWeekOff()) setWeekOff(preset.weekOff);
    if (saturdayChoiceOf(getOrganisationWeekOffRules()) === 'worked') setSaturdays(preset.saturdays);
    if (leaveChoice !== 'keep') setLeaveChoice(preset.leaveTemplateId);
    setModules((current) => Array.from(new Set([...current, ...preset.modules])) as OptionalModule[]);
  }

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
    if (
      current.name === companyName.trim() &&
      current.legalName === nextLegalName &&
      current.teamSize === teamSize &&
      current.goLiveDate === goLiveDate &&
      (industry ? current.industry === industry.label : true)
    ) {
      go('you');
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
      goLiveDate,
      ...(industry ? { industry: industry.label } : {}),
    });
    setSaving(false);
    if (!published) {
      setError('This was saved in this browser but not to your organisation. Check your connection and press Continue again.');
      return;
    }
    go('you');
  }

  /**
   * HR's own record: created from what they typed, or — where an earlier
   * version invented one — the invented figures replaced in place, keeping the
   * id so their account link and any history stay attached.
   */
  function saveMe() {
    if (meForm.hasErrors) {
      setShowMeErrors(true);
      return;
    }
    const details = toEmployeeDetails(meForm.draft);
    if (me && meInvented) {
      updateEmployeeInDirectory({
        ...me,
        ...details,
        fullName: [details.firstName, details.lastName].filter(Boolean).join(' '),
        reportingManagerId: details.reportingManagerId,
      });
    } else if (!me) {
      createEmployeeFromDetails(details, { profile, notify: setMeNotice });
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
    // Two passes, because a manager may be further down the file than the
    // people who report to them: everybody is created first, then the lines
    // the spreadsheet drew between them.
    const createdByLine = new Map<number, Employee>();
    for (const { line, employee, manager } of preview.rows) {
      const { codeSuggested: _codeSuggested, ...details } = employee;
      const reportingManagerId = manager?.kind === 'directory' ? manager.id : null;
      createdByLine.set(line, createEmployeeFromDetails({ ...details, reportingManagerId }, { profile, notify }));
    }
    let linked = false;
    for (const { line, manager } of preview.rows) {
      if (manager?.kind !== 'file') continue;
      const person = createdByLine.get(line);
      const boss = createdByLine.get(manager.line);
      if (!person || !boss) continue;
      updateEmployeeInDirectory({ ...person, reportingManagerId: boss.id, reportingManagerName: boss.fullName });
      linked = true;
    }
    // The chains stamped on leave documents describe the reporting tree.
    if (linked) void syncManagerChains();
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
    // A pattern set in Settings that this question cannot express is 'custom'
    // and left exactly as it is.
    const currentRules = getOrganisationWeekOffRules();
    const nextRules = saturdayRules(saturdays, currentRules);
    if (JSON.stringify(nextRules) !== JSON.stringify(currentRules)) writes.push(saveOrganisationWeekOffRules(nextRules));
    const template = LEAVE_POLICY_TEMPLATES.find((item) => item.id === leaveChoice);
    if (template) writes.push(saveLeavePolicies(template.policies));
    const currentModules = getEnabledModules();
    const sameModules = currentModules.length === modules.length && modules.every((m) => currentModules.includes(m));
    if (!sameModules) writes.push(saveEnabledModules(modules));
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
        subtitle="Five steps, about five minutes. Everything here can be changed later in Settings."
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
            <div>
              <span className="label">What kind of business is it?</span>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Industry">
                {INDUSTRY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={industry?.id === preset.id}
                    onClick={() => chooseIndustry(preset)}
                    className={cn(
                      'border-2 px-3 py-2 text-left',
                      industry?.id === preset.id ? 'border-ink-900 bg-ink-900 text-ink-50' : 'border-ink-300 text-ink-800 hover:border-ink-900',
                    )}
                  >
                    <span className="block text-sm font-semibold">{preset.label}</span>
                    <span className={cn('block text-xs', industry?.id === preset.id ? 'text-ink-200' : 'text-ink-500')}>{preset.summary}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-500">This only fills in suggested answers for the next steps. You can change every one.</p>
            </div>
            <div>
              <label htmlFor="setup-go-live" className="label">Start recording attendance from</label>
              <input
                id="setup-go-live"
                type="date"
                className="input max-w-xs"
                value={goLiveDate}
                onChange={(event) => setGoLiveDate(event.target.value)}
              />
              <p className="mt-1 text-xs text-ink-500">
                Days before this were recorded somewhere else, so nobody is shown as absent for them.
              </p>
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

      {step === 'you' && (
        <Card>
          <h2 className="font-display text-lg font-extrabold text-ink-900">About you</h2>
          {me && !meInvented ? (
            <>
              <p className="mt-1 text-sm text-ink-600">
                You are on the directory as <strong>{me.fullName}</strong> ({me.employeeCode}, {me.designation}). Nothing to do here.
              </p>
              <div className="mt-6 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => go('company')} icon={<ArrowLeft size={14} />}>Back</Button>
                <Button onClick={() => go('people')}>Continue <ArrowRight size={14} /></Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-600">
                {meInvented
                  ? 'An earlier version of Modcon HR filled in your record by itself — a date of birth, a joining date and a ₹36 lakh CTC nobody entered. It is left out of payroll until you put your real details here.'
                  : 'If you are on this company’s payroll, add yourself the way you would add anyone: your attendance, leave and payslips depend on it. If you are in the staff spreadsheet you are about to upload, or not on the payroll at all, skip this.'}
              </p>
              <div className="mt-5">
                <EmployeeDetailsFields
                  form={meForm}
                  showErrors={showMeErrors}
                  fieldPrefix="Your"
                  canEditEmployeeCode
                  managerControl={<p className="text-xs text-ink-500">Set it later from your profile, once your managers are in.</p>}
                />
              </div>
              {meNotice && <p className="mt-3 text-xs text-amber-800">{meNotice}</p>}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => go('company')} icon={<ArrowLeft size={14} />}>Back</Button>
                <div className="flex flex-wrap gap-2">
                  {!meInvented && (
                    <Button variant="secondary" onClick={() => go('people')}>Skip — I’m in the spreadsheet</Button>
                  )}
                  <Button onClick={saveMe}>{meInvented ? 'Save my details' : 'Add me'} <ArrowRight size={14} /></Button>
                </div>
              </div>
            </>
          )}
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
              <strong>Needed for everyone:</strong> name, designation, department, location, date of joining and
              annual CTC (480000 or 4.8 LPA). <strong>Optional:</strong> last name, work email (no email means no
              login), date of birth, reporting manager, employment type, gender, phone, employee code (suggested if
              blank), PAN, UAN, bank account and IFSC. Dates as DD/MM/YYYY, YYYY-MM-DD or 12-Mar-1993.
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
                        {preview.rows.map(({ line, employee, notes }) => (
                          <tr key={line} className="border-t border-ink-200 align-top">
                            <td className="px-2 py-1.5 tabular-nums">
                              {employee.employeeCode}
                              {employee.codeSuggested && <span className="ml-1 text-ink-400">(suggested)</span>}
                            </td>
                            <td className="px-2 py-1.5">
                              {employee.firstName} {employee.lastName}
                              {notes.map((note) => (
                                <p key={note} className="mt-0.5 text-[11px] text-amber-800">{note}</p>
                              ))}
                            </td>
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
              Added {imported} {imported === 1 ? 'person' : 'people'}. Anyone whose reporting manager the file did not settle can be given one from their profile.
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
            <Button variant="ghost" onClick={() => go('you')} icon={<ArrowLeft size={14} />}>
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
          </div>
          <div className="mt-4 max-w-xs">
            <span className="label">Saturdays</span>
            <Select
              ariaLabel="Saturdays"
              value={saturdays}
              onChange={(value) => setSaturdays(value as SaturdayChoice)}
              options={[
                ...SATURDAY_CHOICES.map((choice) => ({ label: choice.label, value: choice.id })),
                ...(saturdays === 'custom' ? [{ label: 'As set in Settings → Week Off', value: 'custom' }] : []),
              ]}
            />
            <p className="mt-1 text-xs text-ink-500">
              Anyone with a different arrangement can be given their own day on their profile. Settings → Week Off has
              every other pattern.
            </p>
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

          <fieldset className="mt-6">
            <legend className="label">Also use</legend>
            <p className="mb-2 text-xs text-ink-500">
              People, attendance, leave, payroll and the Board are always on. Tick anything else you need; the rest stays
              out of everyone&rsquo;s way. Settings → Modules changes this later.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTIONAL_MODULES.map((module) => (
                <label key={module} className="flex items-start gap-2 border border-ink-200 p-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={modules.includes(module)}
                    onChange={(event) =>
                      setModules((current) =>
                        event.target.checked ? [...current, module] : current.filter((m) => m !== module))}
                  />
                  <span>
                    <span className="block font-semibold text-ink-900">{MODULE_DESCRIPTIONS[module].label}</span>
                    <span className="block text-xs text-ink-500">{MODULE_DESCRIPTIONS[module].detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {industry && (
            <p className="mt-4 border-l-2 border-brand-600 pl-3 text-xs text-ink-700">
              <span className="font-semibold">Attendance tip for {industry.label.toLowerCase()}:</span> {industry.attendanceTip}
            </p>
          )}

          <p className="mt-4 text-xs text-ink-600">
            Starting part-way through the year? Balances count from 1 April, so record the leave people have
            already taken in{' '}
            <Link to="/settings?tab=leave" className="font-semibold text-brand-700 hover:underline">
              Settings → Leave Policies → Leave taken before you started
            </Link>{' '}
            once you finish here.
          </p>

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
