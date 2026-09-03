import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Users,
  MessageSquare,
  Gift,
  Plus,
  Trash2,
  MapPin,
  Clock,
  Star,
  ChevronRight,
  BarChart3,
  Layers,
  Globe,
  Download,
  Copy,
  Check,
  Send,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  PageHeader,
  StatCard,
  Tabs,
  Modal,
  Button,
  Badge,
  Avatar,
  Card,
  CardHeader,
  SearchInput,
  Select,
  EmptyState,
  statusTone,
  ProgressBar,
} from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/utils';
import { candidates, hiringFunnel, getJobOpenings, addJobOpening, deleteJobOpening, JOB_OPENINGS_CHANGED_EVENT, getCandidates, removeCandidatesForJob, updateCandidateStage, CANDIDATES_CHANGED_EVENT } from '@/data/recruitment';
import type { JobOpening, Candidate, CandidateStage, Department, EmploymentType, JobStatus } from '@/types';
import { locations, getEmployeeName, getEmployeeDirectory } from '@/data/employees';
import { getDepartmentRecord } from '@/data/departments';
import { useAuth } from '@/lib/auth';
import { getCurrentEmployee } from '@/lib/currentEmployee';
import { departments } from '@/data/departments';
import { useMyEmployeeId } from '@/lib/useMyEmployeeId';
import { useEmployeeDirectoryRevision } from '@/lib/useEmployeeDirectoryRevision';
import { useDepartmentDirectoryRevision } from '@/lib/useDepartmentDirectoryRevision';
import { todayIso } from '@/lib/today';
import { DEFAULT_ORG_KEY } from '@/lib/orgScope';
import {
  careersJobPath,
  careersPath,
  publishJobOpening,
  unpublishJobOpening,
  useOrgJobPostings,
} from '@/lib/publishedJobs';
import {
  JobApplicationError,
  RESUME_MAX_BYTES,
  applicationIdFromCandidateId,
  asCandidate,
  formatBytes,
  isPlausibleEmail,
  resumeBlobUrl,
  setJobApplicationStage,
  submitJobApplication,
  useJobApplications,
} from '@/lib/jobApplications';
import type { JobApplication } from '@/types';
import { BRAND_ACCENT, CHART_CURSOR_FILL, CHART_GRID, CHART_PRIMARY, CHART_STATE, CHART_TICK_FILL, CHART_TOOLTIP_STYLE, INK_RAMP } from '@/lib/chartTheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeBadgeTone(type: EmploymentType) {
  if (type === 'Full-time') return 'blue' as const;
  if (type === 'Part-time') return 'cyan' as const;
  if (type === 'Contract') return 'amber' as const;
  return 'violet' as const;
}

function stageColor(stage: CandidateStage): string {
  const map: Record<CandidateStage, string> = {
    Applied: 'bg-ink-100 border-ink-200',
    Screening: 'bg-amber-50 border-amber-200',
    Interview: 'bg-ink-100 border-ink-300',
    Offer: 'bg-brand-100 border-brand-300',
    Hired: 'bg-emerald-50 border-emerald-200',
    Rejected: 'bg-rose-50 border-rose-200',
  };
  return map[stage] ?? 'bg-ink-50 border-ink-200';
}

function stageHeaderColor(stage: CandidateStage): string {
  const map: Record<CandidateStage, string> = {
    Applied: 'bg-ink-200 text-ink-700',
    Screening: 'bg-amber-200 text-amber-800',
    Interview: 'bg-ink-200 text-ink-900',
    Offer: 'bg-brand-200 text-brand-800',
    Hired: 'bg-emerald-200 text-emerald-800',
    Rejected: 'bg-rose-200 text-rose-800',
  };
  return map[stage] ?? 'bg-ink-200 text-ink-700';
}

function funnelBarColor(stage: CandidateStage): string {
  const map: Record<CandidateStage, string> = {
    Applied: INK_RAMP[400],
    Screening: INK_RAMP[600],
    Interview: INK_RAMP[800],
    Offer: BRAND_ACCENT,
    Hired: CHART_STATE.positive,
    Rejected: CHART_STATE.negative,
  };
  return map[stage] ?? CHART_STATE.neutral;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-ink-200 fill-ink-200'}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface JobCardProps {
  job: JobOpening;
  onClick: () => void;
  onDelete: () => void;
}

function JobCard({ job, onClick, onDelete }: JobCardProps) {
  const manager = getEmployeeName(job.hiringManagerId);
  return (
    <Card
      className="hover:shadow-card-hover transition-shadow cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink-900 text-base truncate group-hover:text-brand-600 transition-colors">
            {job.title}
          </h3>
          <p className="text-sm text-ink-500 mt-0.5">{job.department}</p>
        </div>
        <Badge tone={statusTone(job.status)} dot>
          {job.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 mb-3">
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          {job.location}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {job.experience}
        </span>
        <Badge tone={typeBadgeTone(job.type)}>{job.type}</Badge>
      </div>
      {job.description && (
        <p className="text-xs text-ink-500 line-clamp-2 mb-3">{job.description}</p>
      )}
      <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span className="font-semibold text-ink-800">{job.openings} opening{job.openings > 1 ? 's' : ''}</span>
          <span>{job.applicants} applicants</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Avatar name={manager} size="xs" />
          <span className="text-xs text-ink-500">{manager.split(' ')[0]}</span>
        </div>
      </div>
      <div className="mt-2 text-xs text-ink-400">Posted {timeAgo(job.postedOn)}</div>
      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          icon={<Trash2 size={14} />}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

interface CandidateCardProps {
  candidate: Candidate;
  onClick: () => void;
}

function CandidateCard({ candidate, onClick }: CandidateCardProps) {
  return (
    <div
      className={`rounded-xl border p-3 cursor-pointer hover:shadow-sm transition-shadow ${stageColor(candidate.stage)}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <Avatar name={candidate.name} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-900 truncate">{candidate.name}</p>
          <p className="text-xs text-ink-500 truncate">{candidate.jobTitle}</p>
        </div>
      </div>
      <StarRating rating={candidate.rating} />
      <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
        <span>{candidate.source}</span>
        <span>{candidate.experienceYears} yr{candidate.experienceYears !== 1 ? 's' : ''}</span>
      </div>
      {candidate.currentCompany && (
        <p className="text-xs text-ink-400 mt-1 truncate">{candidate.currentCompany}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post Job Modal Form
// ---------------------------------------------------------------------------

interface PostJobForm {
  title: string;
  department: string;
  location: string;
  type: string;
  openings: string;
  experience: string;
  description: string;
  /** Put it on the public careers page as well as this board. */
  publish: boolean;
}

const emptyForm: PostJobForm = {
  title: '',
  department: '',
  location: '',
  type: 'Full-time',
  openings: '1',
  experience: '',
  description: '',
  publish: true,
};

interface PostJobModalProps {
  open: boolean;
  canPublish: boolean;
  onClose: () => void;
  onSubmit: (form: PostJobForm) => void;
}

function PostJobModal({ open, canPublish, onClose, onSubmit }: PostJobModalProps) {
  const [form, setForm] = useState<PostJobForm>(emptyForm);

  function handleChange(field: keyof PostJobForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.department || !form.location) return;
    onSubmit(form);
    setForm(emptyForm);
    onClose();
  }

  const deptOptions = departments.map((d) => ({ label: d, value: d }));
  const locationOptions = locations.map((l) => ({ label: l, value: l }));
  const typeOptions: { label: string; value: string }[] = [
    { label: 'Full-time', value: 'Full-time' },
    { label: 'Part-time', value: 'Part-time' },
    { label: 'Contract', value: 'Contract' },
    { label: 'Intern', value: 'Intern' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post a New Job"
      subtitle="Fill in the details to publish a new job opening."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} icon={<Plus size={15} />}>
            Post Job
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Job Title <span className="text-rose-500">*</span></label>
          <input
            className="input mt-1"
            placeholder="e.g. Senior Software Engineer"
            value={form.title}
            onChange={(e) => handleChange('title', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Department <span className="text-rose-500">*</span></label>
            <Select
              className="mt-1"
              value={form.department}
              onChange={(v) => handleChange('department', v)}
              options={deptOptions}
              placeholder="Select dept."
            />
          </div>
          <div>
            <label className="label">Location <span className="text-rose-500">*</span></label>
            <Select
              className="mt-1"
              value={form.location}
              onChange={(v) => handleChange('location', v)}
              options={locationOptions}
              placeholder="Select location"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Employment Type</label>
            <Select
              className="mt-1"
              value={form.type}
              onChange={(v) => handleChange('type', v)}
              options={typeOptions}
            />
          </div>
          <div>
            <label className="label">No. of Openings</label>
            <input
              type="number"
              min={1}
              className="input mt-1"
              value={form.openings}
              onChange={(e) => handleChange('openings', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Experience Required</label>
          <input
            className="input mt-1"
            placeholder="e.g. 3–5 yrs"
            value={form.experience}
            onChange={(e) => handleChange('experience', e.target.value)}
          />
        </div>
        <div>
          <label className="label">About the role</label>
          <textarea
            className="input mt-1 min-h-[100px]"
            placeholder="What the person will do, and what you are looking for. This is what candidates read on the careers page."
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            maxLength={4000}
          />
        </div>
        {canPublish && (
          <label className="flex items-start gap-2.5 rounded-xl border border-ink-100 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.publish}
              onChange={(e) => handleChange('publish', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink-800">Publish to the careers page</span>
              <span className="block text-xs text-ink-500 mt-0.5">
                Candidates outside the company can see this role and apply for it. It can be
                published or withdrawn later from the role's own page.
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Candidate Detail Modal
// ---------------------------------------------------------------------------

interface CandidateDetailModalProps {
  candidate: Candidate | null;
  /** Set when this card came from an application rather than the local overlay. */
  application: JobApplication | null;
  canAdvance: boolean;
  /** Why not, when `canAdvance` is false. Never left blank — see below. */
  advanceHint: string;
  onStageChange: (stage: CandidateStage) => void;
  onClose: () => void;
}

/**
 * Downloads the attached resume.
 *
 * The Blob URL is created on click and revoked immediately after the download
 * is handed to the browser, rather than held for the life of the modal: a
 * resume is most of a megabyte and the pipeline can hold a lot of them.
 */
function ResumeDownload({ application }: { application: JobApplication }) {
  function download() {
    const url = resumeBlobUrl(application.resumeContentBase64);
    const link = document.createElement('a');
    link.href = url;
    link.download = application.resumeFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="secondary" size="sm" icon={<Download size={13} />} onClick={download}>
      {application.resumeFileName} ({formatBytes(application.resumeSizeBytes)})
    </Button>
  );
}

const ADVANCE_STAGES: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

function CandidateDetailModal({
  candidate,
  application,
  canAdvance,
  advanceHint,
  onStageChange,
  onClose,
}: CandidateDetailModalProps) {
  if (!candidate) return null;
  return (
    <Modal
      open={!!candidate}
      onClose={onClose}
      title={candidate.name}
      subtitle={`Applying for: ${candidate.jobTitle}`}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={candidate.name} size="lg" />
          <div>
            <Badge tone={statusTone(candidate.stage)}>{candidate.stage}</Badge>
            <div className="mt-1.5">
              <StarRating rating={candidate.rating} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Email</p>
            <p className="text-ink-800 mt-0.5">{candidate.email}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Phone</p>
            <p className="text-ink-800 mt-0.5">{candidate.phone}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Current Company</p>
            <p className="text-ink-800 mt-0.5">{candidate.currentCompany ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Experience</p>
            <p className="text-ink-800 mt-0.5">{candidate.experienceYears} years</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Source</p>
            <p className="text-ink-800 mt-0.5">{candidate.source}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Applied On</p>
            <p className="text-ink-800 mt-0.5">{formatDate(candidate.appliedOn)}</p>
          </div>
        </div>

        {application && (
          <div className="space-y-4 border-t border-ink-100 pt-4">
            <div>
              <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Resume</p>
              <div className="mt-1.5">
                <ResumeDownload application={application} />
              </div>
            </div>

            {application.coverNote && (
              <div>
                <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Why this role</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                  {application.coverNote}
                </p>
              </div>
            )}
          </div>
        )}

        {/* The pipeline controls, for applications and for the candidates a
            recruiter typed in alike. Whichever store the card came from, the
            board behaves the same way — a row of buttons on some cards and
            nothing on others reads as a bug, not as a permission. */}
        <div className="space-y-2 border-t border-ink-100 pt-4">
          <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Move to</p>
          {canAdvance ? (
            <div className="flex flex-wrap gap-1.5">
              {ADVANCE_STAGES.filter((stage) => stage !== candidate.stage).map((stage) => (
                <Button
                  key={stage}
                  variant={stage === 'Rejected' ? 'ghost' : 'secondary'}
                  size="sm"
                  className={stage === 'Rejected' ? 'text-rose-600 hover:bg-rose-50' : undefined}
                  onClick={() => onStageChange(stage)}
                >
                  {stage}
                </Button>
              ))}
            </div>
          ) : (
            // Never simply hidden. "You are not this role's hiring manager" and
            // "nobody has told this app who you are" produce the same absence
            // of buttons, and only one of them is the reader's to fix.
            <p className="text-xs text-ink-500">{advanceHint}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Job Detail Modal
// ---------------------------------------------------------------------------

interface JobDetailModalProps {
  job: JobOpening | null;
  candidates: Candidate[];
  orgId: string;
  /** True when this role is currently on the public careers page. */
  published: boolean;
  canPublish: boolean;
  onPublish: (job: JobOpening) => void;
  onUnpublish: (job: JobOpening) => void;
  onApply: (job: JobOpening) => void;
  onClose: () => void;
  onDelete: () => void;
}

function JobDetailModal({
  job,
  candidates: candidateList,
  orgId,
  published,
  canPublish,
  onPublish,
  onUnpublish,
  onApply,
  onClose,
  onDelete,
}: JobDetailModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [job?.id]);

  if (!job) return null;
  const manager = getEmployeeName(job.hiringManagerId);
  const jobCandidates = candidateList.filter((c) => c.jobId === job.id);
  const careersUrl =
    typeof window === 'undefined'
      ? careersJobPath(orgId, job.id)
      : `${window.location.origin}${careersJobPath(orgId, job.id)}`;

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title={job.title}
      subtitle={`${job.department} · ${job.location}`}
      size="md"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(job.status)} dot>{job.status}</Badge>
          <Badge tone={typeBadgeTone(job.type)}>{job.type}</Badge>
          <Badge tone="gray">{job.experience}</Badge>
          <Badge tone="gray">{job.openings} opening{job.openings > 1 ? 's' : ''}</Badge>
        </div>
        {job.description && (
          <p className="text-sm text-ink-600 leading-relaxed">{job.description}</p>
        )}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Hiring Manager</p>
            <div className="flex items-center gap-2 mt-1">
              <Avatar name={manager} size="xs" />
              <span className="text-ink-800">{manager}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide">Posted</p>
            <p className="text-ink-800 mt-1">{formatDate(job.postedOn)}</p>
          </div>
        </div>
        {/* Publishing, and what it means. A role lives in this browser's local
            overlay until it is published; the careers page is on the server,
            so an unpublished role is invisible to every candidate. Saying so
            here is the difference between "nobody has applied yet" and "nobody
            could have". */}
        <div className="rounded-xl border border-ink-100 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Globe size={15} className={published ? 'mt-0.5 text-emerald-600' : 'mt-0.5 text-ink-400'} />
              <div>
                <p className="text-sm font-medium text-ink-800">
                  {published ? 'Live on the careers page' : 'Not on the careers page'}
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {published
                    ? job.status === 'Open'
                      ? 'Candidates can see this role and apply for it.'
                      : `Published, but candidates cannot see it while its status is ${job.status} — only Open roles are listed.`
                    : 'Publish it to let candidates outside the company see it and apply.'}
                </p>
              </div>
            </div>
            {canPublish && (
              <div className="flex items-center gap-2">
                {published ? (
                  <Button variant="secondary" size="sm" onClick={() => onUnpublish(job)}>
                    Unpublish
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" icon={<Globe size={13} />} onClick={() => onPublish(job)}>
                    Publish
                  </Button>
                )}
              </div>
            )}
          </div>
          {published && (
            <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3">
              <code className="flex-1 truncate rounded-lg bg-ink-50 px-2 py-1.5 text-xs text-ink-600">
                {careersUrl}
              </code>
              <Button
                variant="ghost"
                size="sm"
                icon={copied ? <Check size={13} /> : <Copy size={13} />}
                onClick={() => {
                  navigator.clipboard?.writeText(careersUrl).then(
                    () => setCopied(true),
                    // A refused clipboard (insecure context, denied permission)
                    // must not look like a copy that worked.
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          )}
        </div>

        {published && job.status === 'Open' && (
          <Button variant="secondary" icon={<Send size={14} />} onClick={() => onApply(job)}>
            Apply for this role
          </Button>
        )}

        {jobCandidates.length > 0 && (
          <div>
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide mb-2">Candidates ({jobCandidates.length})</p>
            <div className="space-y-1.5">
              {jobCandidates.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={c.name} size="xs" />
                    <div>
                      <p className="text-sm font-medium text-ink-800">{c.name}</p>
                      <p className="text-xs text-ink-400">{c.currentCompany}</p>
                    </div>
                  </div>
                  <Badge tone={statusTone(c.stage)}>{c.stage}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="danger" icon={<Trash2 size={14} />} onClick={onDelete}>
            Delete Job
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Applying from inside the app (internal mobility)
// ---------------------------------------------------------------------------

interface InternalApplyModalProps {
  job: JobOpening | null;
  orgId: string;
  uid: string | null;
  /** Prefill, from the applicant's own employee record. */
  prefill: { name: string; email: string; phone: string; company: string };
  onClose: () => void;
}

/**
 * The same application a candidate files from the careers page, filed by
 * somebody who already works here.
 *
 * Deliberately the same record and the same pipeline rather than a parallel
 * "internal referral" object: the hiring manager is comparing all the people
 * who want the job, and splitting them across two lists by where they came
 * from is how one of the lists stops being read. Where they came from is the
 * `source` field, which the rules pin — this path may only ever write
 * 'Internal', and an unauthenticated one only ever 'Website'.
 */
function InternalApplyModal({ job, orgId, uid, prefill, onClose }: InternalApplyModalProps) {
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  const [company, setCompany] = useState(prefill.company);
  const [years, setYears] = useState('');
  const [note, setNote] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setName(prefill.name);
    setEmail(prefill.email);
    setPhone(prefill.phone);
    setCompany(prefill.company);
    setYears('');
    setNote('');
    setResume(null);
    setMessage('');
    setDone(false);
  }, [job?.id, prefill.name, prefill.email, prefill.phone, prefill.company]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!job) return;
    setMessage('');

    if (!resume) {
      setMessage('Please attach your resume as a PDF.');
      return;
    }
    if (!isPlausibleEmail(email)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    const experienceYears = Number(years);
    if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 60) {
      setMessage('Years of experience must be a whole number between 0 and 60.');
      return;
    }

    setSubmitting(true);
    try {
      await submitJobApplication({
        orgId,
        jobId: job.id,
        jobTitle: job.title,
        source: 'Internal',
        submittedByUid: uid ?? undefined,
        draft: { name, email, phone, currentCompany: company, experienceYears, coverNote: note, resume },
      });
      setDone(true);
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

  if (!job) return null;

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title={done ? 'Application received' : `Apply — ${job.title}`}
      subtitle={done ? undefined : `${job.department} · ${job.location}`}
      size="md"
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-ink-600">
          Your application for {job.title} is in the pipeline. The hiring team will be in touch
          on {email.trim().toLowerCase()}.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full name <span className="text-rose-500">*</span></label>
              <input className="input mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Email <span className="text-rose-500">*</span></label>
              <input className="input mt-1" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Phone <span className="text-rose-500">*</span></label>
              <input className="input mt-1" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <label className="label">Years of experience <span className="text-rose-500">*</span></label>
              <input className="input mt-1" type="number" min={0} max={60} step={1} value={years} onChange={(e) => setYears(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Current team or company</label>
            <input className="input mt-1" value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="label">Resume (PDF) <span className="text-rose-500">*</span></label>
            <input
              className="input mt-1 py-2"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                setResume(e.target.files?.[0] ?? null);
                setMessage('');
              }}
              required
            />
            <p className="mt-1 text-xs text-ink-400">
              {resume ? `${resume.name} · ${formatBytes(resume.size)}` : `PDF only, up to ${formatBytes(RESUME_MAX_BYTES)}.`}
            </p>
          </div>
          <div>
            <label className="label">Why this role?</label>
            <textarea className="input mt-1 min-h-[100px]" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
          </div>
          {message && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{message}</p>
          )}
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Job Openings Tab
// ---------------------------------------------------------------------------

const PIPELINE_STAGES: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];

const ALL = 'All';

interface JobOpeningsTabProps {
  jobs: JobOpening[];
  onJobClick: (job: JobOpening) => void;
  onDeleteJob: (job: JobOpening) => void;
}

function JobOpeningsTab({ jobs, onJobClick, onDeleteJob }: JobOpeningsTabProps) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const matchSearch = j.title.toLowerCase().includes(search.toLowerCase()) || j.department.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === ALL || j.department === deptFilter;
      const matchStatus = statusFilter === ALL || j.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [jobs, search, deptFilter, statusFilter]);

  const deptOptions = [{ label: 'All Departments', value: ALL }, ...departments.map((d) => ({ label: d, value: d }))];
  const statusOptions: { label: string; value: string }[] = [
    { label: 'All Statuses', value: ALL },
    { label: 'Open', value: 'Open' },
    { label: 'On Hold', value: 'On Hold' },
    { label: 'Draft', value: 'Draft' },
    { label: 'Closed', value: 'Closed' },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search jobs…"
          className="w-64"
        />
        <Select
          value={deptFilter}
          onChange={setDeptFilter}
          options={deptOptions}
          className="w-48"
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          className="w-40"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={26} />}
          title="No job openings found"
          description="Try adjusting your filters or post a new job."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => onJobClick(job)}
              onDelete={() => onDeleteJob(job)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidate Pipeline (Kanban) Tab
// ---------------------------------------------------------------------------

function CandidatePipelineTab({ candidates: candidateList, onCandidateClick }: { candidates: Candidate[]; onCandidateClick: (c: Candidate) => void }) {
  const [search, setSearch] = useState('');

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return candidateList;
    const q = search.toLowerCase();
    return candidateList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.jobTitle.toLowerCase().includes(q) ||
        (c.currentCompany?.toLowerCase().includes(q) ?? false),
    );
  }, [search, candidateList]);

  return (
    <div className="pt-4 space-y-4">
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search candidates…"
        className="w-64"
      />
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '480px' }}>
        {PIPELINE_STAGES.map((stage) => {
          const stageCandidates = filteredCandidates.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="flex-none w-64">
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl font-semibold text-sm ${stageHeaderColor(stage)}`}>
                <span>{stage}</span>
                <span className="rounded-full bg-white/50 px-2 py-0.5 text-xs font-bold">
                  {stageCandidates.length}
                </span>
              </div>
              <div className="rounded-b-xl border border-t-0 border-ink-200 bg-ink-50 p-2 space-y-2 min-h-[400px]">
                {stageCandidates.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-xs text-ink-400">
                    No candidates
                  </div>
                ) : (
                  stageCandidates.map((c) => (
                    <CandidateCard key={c.id} candidate={c} onClick={() => onCandidateClick(c)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics Tab
// ---------------------------------------------------------------------------

function AnalyticsTab({ jobs, candidates: candidateList }: { jobs: JobOpening[]; candidates: Candidate[] }) {
  const funnelData = hiringFunnel(candidateList);
  const total = candidateList.length;
  const openJobs = jobs.filter((j) => j.status === 'Open');

  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    candidateList.forEach((c) => {
      counts[c.source] = (counts[c.source] ?? 0) + 1;
    });
    return Object.entries(counts).map(([source, count]) => ({ source, count }));
  }, [candidateList]);

  return (
    <div className="pt-4 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Hiring Funnel" subtitle="Candidates by stage" />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnelData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: CHART_TICK_FILL }} />
              <YAxis tick={{ fontSize: 12, fill: CHART_TICK_FILL }} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: CHART_CURSOR_FILL }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Candidates">
                {funnelData.map((entry) => (
                  <Cell key={entry.stage} fill={funnelBarColor(entry.stage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader title="Source Breakdown" subtitle="Where candidates come from" />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sourceData} layout="vertical" margin={{ top: 4, right: 16, left: 32, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: CHART_TICK_FILL }} />
              <YAxis dataKey="source" type="category" tick={{ fontSize: 12, fill: CHART_TICK_FILL }} width={72} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: CHART_CURSOR_FILL }}
              />
              <Bar dataKey="count" fill={CHART_PRIMARY} radius={[0, 0, 0, 0]} name="Candidates" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <CardHeader title="Open Positions by Department" subtitle="Active headcount requirements" />
        <div className="space-y-3">
          {departments
            .map((dept) => {
              const deptJobs = openJobs.filter((j) => j.department === dept);
              const totalOpenings = deptJobs.reduce((sum, j) => sum + j.openings, 0);
              const totalApplicants = deptJobs.reduce((sum, j) => sum + j.applicants, 0);
              return { dept, jobs: deptJobs.length, openings: totalOpenings, applicants: totalApplicants };
            })
            .filter((d) => d.jobs > 0)
            .map((d) => (
              <div key={d.dept} className="flex items-center gap-4">
                <div className="w-36 text-sm font-medium text-ink-700 shrink-0">{d.dept}</div>
                <div className="flex-1">
                  <ProgressBar
                    value={Math.min((d.applicants / Math.max(...openJobs.map((j) => j.applicants), 1)) * 100, 100)}
                    tone="brand"
                    size="sm"
                  />
                </div>
                <div className="text-xs text-ink-500 w-32 text-right shrink-0">
                  {d.openings} opening{d.openings > 1 ? 's' : ''} · {d.applicants} applicants
                </div>
              </div>
            ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {funnelData.filter((f) => f.stage !== 'Rejected').map((f) => (
          <Card key={f.stage} className="text-center">
            <p className="text-2xl font-bold text-ink-900">{f.count}</p>
            <p className="text-sm text-ink-500 mt-1">{f.stage}</p>
            <p className="text-xs text-ink-400 mt-0.5">{total > 0 ? Math.round((f.count / total) * 100) : 0}% of total</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'openings', label: 'Job Openings', icon: <Briefcase size={14} /> },
  { id: 'pipeline', label: 'Candidate Pipeline', icon: <Layers size={14} /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
];

/**
 * Who owns a newly posted role. Previously every job created through the UI
 * was stamped with 'emp-004', so each one displayed that one person as hiring
 * manager whatever the department. Credit the person posting it, falling back
 * to the department's head.
 */
function resolveHiringManagerId(department: string, posterId?: string): string {
  if (posterId) return posterId;
  const headName = getDepartmentRecord(department)?.head;
  if (!headName) return '';
  return getEmployeeDirectory().find((employee) => employee.fullName === headName)?.id ?? '';
}

export function RecruitmentPage() {
  const { profile, isAdmin, isHR, isManager } = useAuth();
  const currentEmployee = getCurrentEmployee(profile);
  const directoryRevision = useEmployeeDirectoryRevision();
  const departmentRevision = useDepartmentDirectoryRevision();
  const [jobs, setJobs] = useState<JobOpening[]>(() => getJobOpenings());
  const [candidateList, setCandidateList] = useState<Candidate[]>(() => getCandidates());
  const [activeTab, setActiveTab] = useState('openings');
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOpening | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobOpening | null>(null);
  const [applyTarget, setApplyTarget] = useState<JobOpening | null>(null);
  const [publishError, setPublishError] = useState('');

  const orgId = profile?.orgId || DEFAULT_ORG_KEY;
  // Who administers the careers page, and who may only look at it. Both reads
  // are gated on `isManager` so a role with no access to the pipeline never
  // opens a listener the rules will refuse — a denied subscription is a real
  // console error and an empty board that looks like an empty pipeline.
  const canReadApplications = isManager;
  const canPublish = isAdmin || isHR;
  const { applications } = useJobApplications(orgId, canReadApplications);
  const { published } = useOrgJobPostings(orgId, canReadApplications);

  /**
   * The pipeline, from both stores at once.
   *
   * Candidates a recruiter typed in live in the local overlay; people who
   * applied live in Firestore. A board that showed only the first would report
   * an empty pipeline for a role the organisation had just published and
   * received applications for, which is the moment the board matters most.
   */
  const applicationsById = useMemo(
    () => new Map(applications.map((application) => [application.id, application])),
    [applications],
  );
  const pipeline = useMemo(
    () => [...applications.map(asCandidate), ...candidateList],
    [applications, candidateList],
  );

  const selectedApplication = useMemo(() => {
    if (!selectedCandidate) return null;
    const applicationId = applicationIdFromCandidateId(selectedCandidate.id);
    return applicationId ? applicationsById.get(applicationId) ?? null : null;
  }, [selectedCandidate, applicationsById]);

  /**
   * Who may move somebody through the pipeline.
   *
   * The organisation's administrators, and the manager the job itself names as
   * its hiring manager — the person running that shortlist, who otherwise had
   * to ask HR to record decisions they had already taken.
   *
   * Identity comes from `employee_links` (`useMyEmployeeId`), never from the
   * localStorage directory: the rules resolve it that way, and offering a
   * button the server will refuse is worse than not offering it. For an
   * application the rule below is a courtesy — firestore.rules decides. For a
   * candidate out of the local overlay there is no server involved, so this
   * *is* the whole gate; that is a property of where those records live, not a
   * judgement that they matter less.
   */
  const { employeeId: myEmployeeId, resolved: employeeIdResolved } = useMyEmployeeId(profile);

  function jobFor(jobId: string): JobOpening | undefined {
    return published.get(jobId) ?? jobs.find((job) => job.id === jobId);
  }

  function isHiringManagerFor(jobId: string): boolean {
    if (!isManager || !myEmployeeId) return false;
    return jobFor(jobId)?.hiringManagerId === myEmployeeId;
  }

  const canAdvanceSelected = selectedCandidate
    ? canPublish || isHiringManagerFor(selectedCandidate.jobId)
    : false;

  /** Why the buttons are absent. Always a specific answer, never silence. */
  const advanceHint = useMemo(() => {
    if (!selectedCandidate || canAdvanceSelected) return '';
    if (!isManager) {
      return 'Moving a candidate through the pipeline is done by the role’s hiring manager, HR or an administrator.';
    }
    if (!employeeIdResolved) return 'Checking which roles you are hiring for…';
    if (!myEmployeeId) {
      return 'Your account is not linked to an employee record, so this app cannot tell which roles you are the hiring manager for. An administrator can link it from the Admin dashboard.';
    }
    const owner = jobFor(selectedCandidate.jobId)?.hiringManagerId;
    if (!owner) {
      return `${selectedCandidate.jobTitle} has no hiring manager recorded, so only HR or an administrator can move this candidate.`;
    }
    // getEmployeeName falls back to 'Unknown' for an id the directory does not
    // hold — which happens for a manager who has left, and reads as a bug
    // rather than as an answer. Name them only when there is a name.
    const ownerName = getEmployeeDirectory().find((employee) => employee.id === owner)?.fullName;
    return ownerName
      ? `${ownerName} is the hiring manager for ${selectedCandidate.jobTitle}. Only they, HR or an administrator can move this candidate.`
      : `You are not the hiring manager for ${selectedCandidate.jobTitle}. Only they, HR or an administrator can move this candidate.`;
  }, [selectedCandidate, canAdvanceSelected, isManager, employeeIdResolved, myEmployeeId, jobs, published]);

  // The open modal holds a snapshot; without this, advancing a stage leaves the
  // badge in the modal reading whatever it read when it was opened.
  useEffect(() => {
    if (selectedApplication) setSelectedCandidate(asCandidate(selectedApplication));
  }, [selectedApplication?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleJobOpeningsChanged() {
      setJobs(getJobOpenings());
    }
    function handleCandidatesChanged() {
      setCandidateList(getCandidates());
    }

    window.addEventListener(JOB_OPENINGS_CHANGED_EVENT, handleJobOpeningsChanged);
    window.addEventListener(CANDIDATES_CHANGED_EVENT, handleCandidatesChanged);
    return () => {
      window.removeEventListener(JOB_OPENINGS_CHANGED_EVENT, handleJobOpeningsChanged);
      window.removeEventListener(CANDIDATES_CHANGED_EVENT, handleCandidatesChanged);
    };
  }, []);

  const stats = useMemo(() => {
    const open = jobs.filter((j) => j.status === 'Open').reduce((s, j) => s + j.openings, 0);
    const totalApplicants = pipeline.length;
    const inInterview = pipeline.filter((c) => c.stage === 'Interview').length;
    const offers = pipeline.filter((c) => c.stage === 'Offer').length;
    return { open, totalApplicants, inInterview, offers };
  }, [jobs, pipeline, directoryRevision, departmentRevision]);

  async function handlePostJob(form: { title: string; department: string; location: string; type: string; openings: string; experience: string; description: string; publish: boolean }) {
    const newJob: JobOpening = {
      id: `job-new-${Date.now()}`,
      title: form.title,
      department: form.department as Department,
      location: form.location,
      type: form.type as EmploymentType,
      status: 'Open' as JobStatus,
      openings: parseInt(form.openings, 10) || 1,
      applicants: 0,
      postedOn: todayIso(),
      hiringManagerId: resolveHiringManagerId(form.department, currentEmployee?.id),
      experience: form.experience || 'Not specified',
      description: form.description,
    };
    setJobs(addJobOpening(newJob));
    if (form.publish) await handlePublish(newJob);
  }

  async function handlePublish(job: JobOpening) {
    setPublishError('');
    try {
      await publishJobOpening(orgId, job);
    } catch {
      setPublishError(
        `“${job.title}” was posted to the board but could not be published to the careers page. It is not visible to candidates.`,
      );
    }
  }

  async function handleUnpublish(job: JobOpening) {
    setPublishError('');
    try {
      await unpublishJobOpening(job.id);
    } catch {
      setPublishError(`“${job.title}” could not be taken off the careers page. It is still visible to candidates.`);
    }
  }

  /**
   * Move the selected card to a stage, in whichever store it came from.
   *
   * One handler rather than two call sites, because the pipeline is one board:
   * the difference between an application and an overlay candidate is where
   * the write lands, and that is this function's business and nobody else's.
   */
  async function handleStageChange(stage: CandidateStage) {
    if (!selectedCandidate) return;
    setPublishError('');

    if (selectedApplication) {
      try {
        await setJobApplicationStage(selectedApplication.id, stage);
      } catch {
        // The rules refuse a stage change from anyone but the job's hiring
        // manager or an administrator, so this is reachable — a manager
        // reassigned off the role between render and click lands here.
        setPublishError(
          `${selectedApplication.name} could not be moved to ${stage}. You may no longer be the hiring manager for ${selectedApplication.jobTitle}.`,
        );
      }
      return;
    }

    const next = updateCandidateStage(selectedCandidate.id, stage);
    setCandidateList(next);
    setSelectedCandidate(next.find((c) => c.id === selectedCandidate.id) ?? null);
  }

  async function handleDeleteJob(job: JobOpening) {
    setJobs(deleteJobOpening(job.id));
    setCandidateList(removeCandidatesForJob(job.id));
    if (selectedJob?.id === job.id) setSelectedJob(null);
    setDeleteTarget(null);
    // Deleting the opening takes it off the careers page too, or the role
    // stays advertised and keeps collecting applications for a job that no
    // longer exists on the board. Applications already received are kept —
    // see unpublishJobOpening.
    if (published.has(job.id)) await handleUnpublish(job);
  }

  const tabItems = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.id === 'openings' ? jobs.filter((j) => j.status === 'Open').length
      : t.id === 'pipeline' ? pipeline.filter((c) => c.stage !== 'Rejected').length
      : undefined,
  }));

  return (
    <div>
      <PageHeader
        title="Recruitment"
        subtitle="Manage job openings, track candidates, and analyse your hiring pipeline."
        actions={
          <div className="flex items-center gap-2">
            <a
              href={careersPath(orgId)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary px-4 py-2 text-sm"
            >
              <Globe size={15} />
              Careers page
            </a>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setPostJobOpen(true)}
            >
              Post a Job
            </Button>
          </div>
        }
      />

      {/* A publish that did not land is the failure mode that reads as success:
          the role sits on this board looking posted while no candidate can see
          it. It is a separate write from the local one, so it fails separately
          and has to be said out loud. */}
      {publishError && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {publishError}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Open Positions"
          value={stats.open}
          icon={<Briefcase size={22} />}
        />
        <StatCard
          label="Total Applicants"
          value={stats.totalApplicants}
          icon={<Users size={22} />}
        />
        <StatCard
          label="In Interview"
          value={stats.inInterview}
          icon={<MessageSquare size={22} />}
        />
        <StatCard
          label="Offers Extended"
          value={stats.offers}
          icon={<Gift size={22} />}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabItems} active={activeTab} onChange={setActiveTab} className="mb-0" />

      {activeTab === 'openings' && (
        <JobOpeningsTab jobs={jobs} onJobClick={setSelectedJob} onDeleteJob={setDeleteTarget} />
      )}
      {activeTab === 'pipeline' && (
        <CandidatePipelineTab candidates={pipeline} onCandidateClick={setSelectedCandidate} />
      )}
      {activeTab === 'analytics' && <AnalyticsTab jobs={jobs} candidates={pipeline} />}

      <PostJobModal
        open={postJobOpen}
        canPublish={canPublish}
        onClose={() => setPostJobOpen(false)}
        onSubmit={handlePostJob}
      />
      <JobDetailModal
        job={selectedJob}
        candidates={pipeline}
        orgId={orgId}
        published={selectedJob ? published.has(selectedJob.id) : false}
        canPublish={canPublish}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onApply={(job) => {
          setSelectedJob(null);
          setApplyTarget(job);
        }}
        onClose={() => setSelectedJob(null)}
        onDelete={() => {
          if (selectedJob) setDeleteTarget(selectedJob);
        }}
      />
      <CandidateDetailModal
        candidate={selectedCandidate}
        application={selectedApplication}
        canAdvance={canAdvanceSelected}
        advanceHint={advanceHint}
        onStageChange={handleStageChange}
        onClose={() => setSelectedCandidate(null)}
      />
      <InternalApplyModal
        job={applyTarget}
        orgId={orgId}
        uid={profile?.uid ?? null}
        prefill={{
          name: currentEmployee?.fullName ?? profile?.displayName ?? '',
          // The applicant's own address, not the account's, when the two
          // differ — the application is keyed on it and it is what the hiring
          // team will reply to.
          email: currentEmployee?.email ?? profile?.email ?? '',
          phone: currentEmployee?.phone ?? '',
          company: currentEmployee?.department ?? '',
        }}
        onClose={() => setApplyTarget(null)}
      />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Job"
        subtitle={`Remove ${deleteTarget?.title ?? 'this job'} from the recruitment board`}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteTarget && handleDeleteJob(deleteTarget)}>
              Delete Job
            </Button>
          </>
        )}
      >
        <p className="text-sm text-ink-600">
          Deleted job posts are removed from the job board and stay deleted after refresh.
        </p>
      </Modal>
    </div>
  );
}
