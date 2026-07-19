import { useEffect, useMemo, useState } from 'react';
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
import { departments, locations, getEmployeeName } from '@/data/employees';

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
    Interview: 'bg-blue-50 border-blue-200',
    Offer: 'bg-violet-50 border-violet-200',
    Hired: 'bg-emerald-50 border-emerald-200',
    Rejected: 'bg-rose-50 border-rose-200',
  };
  return map[stage] ?? 'bg-ink-50 border-ink-200';
}

function stageHeaderColor(stage: CandidateStage): string {
  const map: Record<CandidateStage, string> = {
    Applied: 'bg-ink-200 text-ink-700',
    Screening: 'bg-amber-200 text-amber-800',
    Interview: 'bg-blue-200 text-blue-800',
    Offer: 'bg-violet-200 text-violet-800',
    Hired: 'bg-emerald-200 text-emerald-800',
    Rejected: 'bg-rose-200 text-rose-800',
  };
  return map[stage] ?? 'bg-ink-200 text-ink-700';
}

function funnelBarColor(stage: CandidateStage): string {
  const map: Record<CandidateStage, string> = {
    Applied: '#94a3b8',
    Screening: '#fbbf24',
    Interview: '#3b82f6',
    Offer: '#8b5cf6',
    Hired: '#10b981',
    Rejected: '#f43f5e',
  };
  return map[stage] ?? '#94a3b8';
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
}

const emptyForm: PostJobForm = {
  title: '',
  department: '',
  location: '',
  type: 'Full-time',
  openings: '1',
  experience: '',
};

interface PostJobModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: PostJobForm) => void;
}

function PostJobModal({ open, onClose, onSubmit }: PostJobModalProps) {
  const [form, setForm] = useState<PostJobForm>(emptyForm);

  function handleChange(field: keyof PostJobForm, value: string) {
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
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Candidate Detail Modal
// ---------------------------------------------------------------------------

interface CandidateDetailModalProps {
  candidate: Candidate | null;
  onClose: () => void;
}

function CandidateDetailModal({ candidate, onClose }: CandidateDetailModalProps) {
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
  onClose: () => void;
  onDelete: () => void;
}

function JobDetailModal({ job, candidates: candidateList, onClose, onDelete }: JobDetailModalProps) {
  if (!job) return null;
  const manager = getEmployeeName(job.hiringManagerId);
  const jobCandidates = candidateList.filter((c) => c.jobId === job.id);
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                cursor={{ fill: '#f8fafc' }}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis dataKey="source" type="category" tick={{ fontSize: 12, fill: '#64748b' }} width={72} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} name="Candidates" />
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

export function RecruitmentPage() {
  const [jobs, setJobs] = useState<JobOpening[]>(() => getJobOpenings());
  const [candidateList, setCandidateList] = useState<Candidate[]>(() => getCandidates());
  const [activeTab, setActiveTab] = useState('openings');
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOpening | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobOpening | null>(null);

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
    const totalApplicants = candidateList.length;
    const inInterview = candidateList.filter((c) => c.stage === 'Interview').length;
    const offers = candidateList.filter((c) => c.stage === 'Offer').length;
    return { open, totalApplicants, inInterview, offers };
  }, [jobs, candidateList]);

  function handlePostJob(form: { title: string; department: string; location: string; type: string; openings: string; experience: string }) {
    const newJob: JobOpening = {
      id: `job-new-${Date.now()}`,
      title: form.title,
      department: form.department as Department,
      location: form.location,
      type: form.type as EmploymentType,
      status: 'Open' as JobStatus,
      openings: parseInt(form.openings, 10) || 1,
      applicants: 0,
      postedOn: new Date().toISOString().slice(0, 10),
      hiringManagerId: 'emp-004',
      experience: form.experience || 'Not specified',
      description: '',
    };
    setJobs(addJobOpening(newJob));
  }

  function handleDeleteJob(job: JobOpening) {
    setJobs(deleteJobOpening(job.id));
    setCandidateList(removeCandidatesForJob(job.id));
    if (selectedJob?.id === job.id) setSelectedJob(null);
    setDeleteTarget(null);
  }

  const tabItems = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.id === 'openings' ? jobs.filter((j) => j.status === 'Open').length
      : t.id === 'pipeline' ? candidateList.filter((c) => c.stage !== 'Rejected').length
      : undefined,
  }));

  return (
    <div>
      <PageHeader
        title="Recruitment"
        subtitle="Manage job openings, track candidates, and analyse your hiring pipeline."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setPostJobOpen(true)}
          >
            Post a Job
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Open Positions"
          value={stats.open}
          icon={<Briefcase size={22} />}
          iconClass="bg-brand-50 text-brand-600"
          delta={8}
          deltaLabel="vs last month"
        />
        <StatCard
          label="Total Applicants"
          value={stats.totalApplicants}
          icon={<Users size={22} />}
          iconClass="bg-violet-50 text-violet-600"
          delta={14}
          deltaLabel="vs last month"
        />
        <StatCard
          label="In Interview"
          value={stats.inInterview}
          icon={<MessageSquare size={22} />}
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Offers Extended"
          value={stats.offers}
          icon={<Gift size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
          delta={2}
          deltaLabel="this week"
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabItems} active={activeTab} onChange={setActiveTab} className="mb-0" />

      {activeTab === 'openings' && (
        <JobOpeningsTab jobs={jobs} onJobClick={setSelectedJob} onDeleteJob={setDeleteTarget} />
      )}
      {activeTab === 'pipeline' && (
        <CandidatePipelineTab candidates={candidateList} onCandidateClick={setSelectedCandidate} />
      )}
      {activeTab === 'analytics' && <AnalyticsTab jobs={jobs} candidates={candidateList} />}

      <PostJobModal
        open={postJobOpen}
        onClose={() => setPostJobOpen(false)}
        onSubmit={handlePostJob}
      />
      <JobDetailModal
        job={selectedJob}
        candidates={candidateList}
        onClose={() => setSelectedJob(null)}
        onDelete={() => {
          if (selectedJob) setDeleteTarget(selectedJob);
        }}
      />
      <CandidateDetailModal candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />

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
