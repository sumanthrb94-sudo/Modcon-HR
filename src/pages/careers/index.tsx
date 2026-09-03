/**
 * The public careers page: the way in for a candidate applying from outside.
 *
 * Deliberately not under `AppLayout` and deliberately not behind `RequireAuth`.
 * Everything else in this application is somebody's workplace; this is the one
 * page read by a person who does not work here, has no account, and cannot be
 * given one before they are hired. So it carries no sidebar, no notifications
 * and no org switcher, and it never touches the local overlay in `src/data/*` —
 * that is this browser's copy of one company's data and a visitor has none.
 *
 * It reads open roles straight from Firestore (`usePublicJobOpenings`) and
 * writes applications straight back (`submitJobApplication`). The rules are the
 * whole of the authorization story here; see the `job_applications` block in
 * firestore.rules, and the header of src/lib/jobApplications.ts.
 *
 * The organisation is in the URL rather than discovered, because there is no
 * signed-in account to read it from and no public directory of tenants to look
 * it up in. `/careers` alone falls back to the default organisation.
 */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Paperclip,
  Search,
} from 'lucide-react';
import { Badge, BrandMark, Button, EmptyState } from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/utils';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import { careersJobPath, careersPath, usePublicJobOpenings } from '@/lib/publishedJobs';
import {
  COVER_NOTE_MAX_CHARS,
  JobApplicationError,
  RESUME_MAX_BYTES,
  formatBytes,
  isPlausibleEmail,
  submitJobApplication,
} from '@/lib/jobApplications';
import type { EmploymentType, JobOpening } from '@/types';

function typeBadgeTone(type: EmploymentType) {
  if (type === 'Full-time') return 'blue' as const;
  if (type === 'Part-time') return 'cyan' as const;
  if (type === 'Contract') return 'amber' as const;
  return 'violet' as const;
}

function CareersShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      {/* This is the one page read by somebody who does not work here, so it
          carries the mark rather than a generic briefcase glyph. */}
      <header className="border-b-2 border-ink-900/40 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <div>
              <p className="font-display text-base font-extrabold leading-tight text-ink-900">Careers</p>
              <p className="text-[10px] uppercase tracking-[0.1em] text-ink-500">Open roles and applications</p>
            </div>
          </div>
          <Link to="/login" className="text-sm font-medium text-ink-500 hover:text-brand-600">
            Employee sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-ink-400 sm:px-6">
        Applications are held by the hiring organisation and are visible only to its recruiters.
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The list of open roles
// ---------------------------------------------------------------------------

export function CareersPage() {
  const { orgKey } = useParams<{ orgKey?: string }>();
  const org = orgKey || DEFAULT_ORG_KEY;
  const { jobs, loading, error } = usePublicJobOpenings(org);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (job) =>
        job.title.toLowerCase().includes(q) ||
        job.department.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  return (
    <CareersShell>
      <h1 className="text-2xl font-bold text-ink-900">Open roles</h1>
      <p className="mt-1 text-sm text-ink-500">
        {loading
          ? 'Loading open roles…'
          : `${jobs.length} role${jobs.length === 1 ? '' : 's'} currently accepting applications.`}
      </p>

      {jobs.length > 0 && (
        <div className="relative mt-5">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Search by role, team or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search open roles"
          />
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-brand-600" size={26} />
          </div>
        )}

        {/* A denied read and an empty organisation look identical to a
            visitor, and only one of them is their problem — so say which. */}
        {!loading && error && (
          <EmptyState
            icon={<Briefcase size={26} />}
            title="Open roles could not be loaded"
            description="This careers page is not available right now. Please try again later."
          />
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            icon={<Briefcase size={26} />}
            title={jobs.length === 0 ? 'No open roles right now' : 'No roles match that search'}
            description={
              jobs.length === 0
                ? 'There are no positions accepting applications at the moment. Please check back later.'
                : 'Try a different role, team or location.'
            }
          />
        )}

        {!loading &&
          !error &&
          filtered.map((job) => (
            <Link
              key={job.id}
              to={careersJobPath(org, job.id)}
              className="card block transition-shadow hover:shadow-card-hover"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink-900">{job.title}</h2>
                  <p className="mt-0.5 text-sm text-ink-500">{job.department}</p>
                </div>
                <Badge tone={typeBadgeTone(job.type)}>{job.type}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <MapPin size={12} />
                  {job.location}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {job.experience}
                </span>
                <span>
                  {job.openings} opening{job.openings === 1 ? '' : 's'}
                </span>
                <span className="text-ink-400">Posted {timeAgo(job.postedOn)}</span>
              </div>
              {job.description && (
                <p className="mt-3 line-clamp-2 text-sm text-ink-500">{job.description}</p>
              )}
            </Link>
          ))}
      </div>
    </CareersShell>
  );
}

// ---------------------------------------------------------------------------
// One role, and the form to apply for it
// ---------------------------------------------------------------------------

export function CareersJobPage() {
  const { orgKey, jobId } = useParams<{ orgKey?: string; jobId: string }>();
  const navigate = useNavigate();
  const org = orgKey || DEFAULT_ORG_KEY;
  const { jobs, loading, error } = usePublicJobOpenings(org);
  const job = jobs.find((item) => item.id === jobId) ?? null;

  return (
    <CareersShell>
      <button
        type="button"
        onClick={() => navigate(careersPath(org))}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600"
      >
        <ArrowLeft size={15} />
        All open roles
      </button>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-brand-600" size={26} />
        </div>
      )}

      {!loading && !job && (
        <EmptyState
          icon={<Briefcase size={26} />}
          title={error ? 'This role could not be loaded' : 'This role is no longer open'}
          description={
            error
              ? 'Please try again later.'
              : 'It may have been filled or withdrawn. Have a look at the other open roles.'
          }
        />
      )}

      {!loading && job && <JobDetail org={org} job={job} />}
    </CareersShell>
  );
}

function JobDetail({ org, job }: { org: string; job: JobOpening }) {
  return (
    <>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{job.title}</h1>
            <p className="mt-1 text-sm text-ink-500">
              {job.department} · {job.location}
            </p>
          </div>
          <Badge tone={typeBadgeTone(job.type)}>{job.type}</Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink-100 pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Experience</dt>
            <dd className="mt-0.5 text-ink-800">{job.experience}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Openings</dt>
            <dd className="mt-0.5 text-ink-800">{job.openings}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Type</dt>
            <dd className="mt-0.5 text-ink-800">{job.type}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Posted</dt>
            <dd className="mt-0.5 text-ink-800">{formatDate(job.postedOn)}</dd>
          </div>
        </dl>

        {job.description && (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <h2 className="text-sm font-semibold text-ink-900">About the role</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
              {job.description}
            </p>
          </div>
        )}
      </div>

      <ApplyForm org={org} job={job} />
    </>
  );
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  currentCompany: string;
  experienceYears: string;
  coverNote: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  phone: '',
  currentCompany: '',
  experienceYears: '',
  coverNote: '',
};

function ApplyForm({ org, job }: { org: string; job: JobOpening }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  // A different role is a different application; nothing typed for the last
  // one should carry over into it.
  useEffect(() => {
    setForm(EMPTY_FORM);
    setResume(null);
    setSubmitted(false);
    setMessage('');
  }, [job.id]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!resume) {
      setMessage('Please attach your resume as a PDF.');
      return;
    }
    if (!isPlausibleEmail(form.email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    const years = Number(form.experienceYears);
    if (!Number.isInteger(years) || years < 0 || years > 60) {
      setMessage('Years of experience must be a whole number between 0 and 60.');
      return;
    }

    setSubmitting(true);
    try {
      await submitJobApplication({
        orgId: org,
        jobId: job.id,
        jobTitle: job.title,
        source: 'Website',
        draft: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          currentCompany: form.currentCompany,
          experienceYears: years,
          coverNote: form.coverNote,
          resume,
        },
      });
      setSubmitted(true);
    } catch (err) {
      setMessage(
        err instanceof JobApplicationError
          ? err.message
          : 'Your application could not be submitted. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="card mt-5" data-testid="application-submitted">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={22} />
          <div>
            <h2 className="text-base font-semibold text-ink-900">Application received</h2>
            <p className="mt-1 text-sm text-ink-600">
              Thank you, {form.name.trim()}. Your application for {job.title} is with the hiring
              team. If your experience matches what they are looking for, they will contact you on{' '}
              {form.email.trim().toLowerCase()}.
            </p>
            <Link
              to={careersPath(org)}
              className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              Browse other open roles
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="card mt-5" onSubmit={handleSubmit} noValidate>
      <h2 className="text-base font-semibold text-ink-900">Apply for this role</h2>
      <p className="mt-1 text-sm text-ink-500">
        One application per email address per role.
      </p>

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="apply-name">
              Full name <span className="text-rose-500">*</span>
            </label>
            <input
              id="apply-name"
              className="input mt-1"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="apply-email">
              Email <span className="text-rose-500">*</span>
            </label>
            <input
              id="apply-email"
              type="email"
              className="input mt-1"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="apply-phone">
              Phone <span className="text-rose-500">*</span>
            </label>
            <input
              id="apply-phone"
              className="input mt-1"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              maxLength={32}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="apply-experience">
              Years of experience <span className="text-rose-500">*</span>
            </label>
            <input
              id="apply-experience"
              type="number"
              min={0}
              max={60}
              step={1}
              className="input mt-1"
              value={form.experienceYears}
              onChange={(e) => set('experienceYears', e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="apply-company">
            Current company
          </label>
          <input
            id="apply-company"
            className="input mt-1"
            value={form.currentCompany}
            onChange={(e) => set('currentCompany', e.target.value)}
            maxLength={120}
          />
        </div>

        <div>
          <label className="label" htmlFor="apply-resume">
            Resume (PDF) <span className="text-rose-500">*</span>
          </label>
          <input
            id="apply-resume"
            type="file"
            accept="application/pdf"
            className="input mt-1 py-2"
            onChange={(e) => {
              setResume(e.target.files?.[0] ?? null);
              setMessage('');
            }}
            required
          />
          <p className="mt-1 text-xs text-ink-400">
            {resume ? (
              <span className="inline-flex items-center gap-1 text-ink-500">
                <Paperclip size={11} />
                {resume.name} · {formatBytes(resume.size)}
              </span>
            ) : (
              `PDF only, up to ${formatBytes(RESUME_MAX_BYTES)}.`
            )}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="apply-note">
            Why this role?
          </label>
          <textarea
            id="apply-note"
            className="input mt-1 min-h-[110px]"
            value={form.coverNote}
            onChange={(e) => set('coverNote', e.target.value)}
            maxLength={COVER_NOTE_MAX_CHARS}
            placeholder="A few lines about why you are a good fit."
          />
        </div>
      </div>

      {message && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {message}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </Button>
      </div>
    </form>
  );
}
