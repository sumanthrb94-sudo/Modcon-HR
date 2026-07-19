import type { JobOpening, Candidate, CandidateStage } from '@/types';

// ---------------------------------------------------------------------------
// Job Openings
// ---------------------------------------------------------------------------

export const jobOpenings: JobOpening[] = [
  {
    id: 'job-001',
    title: 'Senior Backend Engineer',
    department: 'Engineering',
    location: 'Bengaluru',
    type: 'Full-time',
    status: 'Open',
    openings: 2,
    applicants: 48,
    postedOn: '2026-05-01',
    hiringManagerId: 'emp-002',
    experience: '4–7 yrs',
    description:
      'We are looking for a Senior Backend Engineer to design and scale our core API platform. You will work with Go/Node, PostgreSQL, and Kafka in a high-availability environment.',
  },
  {
    id: 'job-002',
    title: 'Product Designer',
    department: 'Design',
    location: 'Bengaluru',
    type: 'Full-time',
    status: 'Open',
    openings: 1,
    applicants: 35,
    postedOn: '2026-05-08',
    hiringManagerId: 'emp-022',
    experience: '3–5 yrs',
    description:
      'Join our design team to craft intuitive B2B SaaS experiences. You will own end-to-end product design from discovery to delivery using Figma and a mature design system.',
  },
  {
    id: 'job-003',
    title: 'Account Executive – Enterprise',
    department: 'Sales',
    location: 'Delhi',
    type: 'Full-time',
    status: 'Open',
    openings: 3,
    applicants: 62,
    postedOn: '2026-04-18',
    hiringManagerId: 'emp-005',
    experience: '5–8 yrs',
    description:
      'Drive new logo acquisition in the enterprise segment. Own a territory, run consultative sales cycles, and work closely with pre-sales and CS teams to close deals.',
  },
  {
    id: 'job-004',
    title: 'Sales Development Representative',
    department: 'Sales',
    location: 'Gurugram',
    type: 'Full-time',
    status: 'Open',
    openings: 2,
    applicants: 41,
    postedOn: '2026-05-14',
    hiringManagerId: 'emp-030',
    experience: '1–3 yrs',
    description:
      'Generate qualified pipeline through outbound prospecting, cold outreach, and targeted campaigns. Partner with AEs to book discovery meetings.',
  },
  {
    id: 'job-005',
    title: 'HR Business Partner',
    department: 'Human Resources',
    location: 'Hyderabad',
    type: 'Full-time',
    status: 'Open',
    openings: 1,
    applicants: 27,
    postedOn: '2026-05-20',
    hiringManagerId: 'emp-004',
    experience: '4–6 yrs',
    description:
      'Act as a strategic partner to business leaders, driving talent management, org design, and employee engagement initiatives across multiple functions.',
  },
  {
    id: 'job-006',
    title: 'Senior Product Manager',
    department: 'Product',
    location: 'Mumbai',
    type: 'Full-time',
    status: 'Open',
    openings: 1,
    applicants: 53,
    postedOn: '2026-04-25',
    hiringManagerId: 'emp-003',
    experience: '5–8 yrs',
    description:
      'Define and execute the roadmap for our core HRMS platform. You will work cross-functionally with Engineering, Design, and Sales to ship high-impact features.',
  },
  {
    id: 'job-007',
    title: 'DevOps / SRE Engineer',
    department: 'Engineering',
    location: 'Pune',
    type: 'Full-time',
    status: 'On Hold',
    openings: 1,
    applicants: 19,
    postedOn: '2026-04-10',
    hiringManagerId: 'emp-010',
    experience: '3–5 yrs',
    description:
      'Build and operate production infrastructure on AWS using Kubernetes and Terraform. Drive observability, SLO management, and incident response practices.',
  },
  {
    id: 'job-008',
    title: 'Content Strategist & Writer',
    department: 'Marketing',
    location: 'Remote',
    type: 'Contract',
    status: 'Open',
    openings: 1,
    applicants: 30,
    postedOn: '2026-05-28',
    hiringManagerId: 'emp-040',
    experience: '2–4 yrs',
    description:
      'Create compelling long-form content, case studies, and thought leadership pieces that support demand generation and brand authority in the HR tech space.',
  },
  {
    id: 'job-009',
    title: 'Financial Analyst',
    department: 'Finance',
    location: 'Mumbai',
    type: 'Full-time',
    status: 'Draft',
    openings: 1,
    applicants: 0,
    postedOn: '2026-06-05',
    hiringManagerId: 'emp-006',
    experience: '2–4 yrs',
    description:
      'Support FP&A activities including budgeting, forecasting, and variance analysis. Work closely with business units to provide actionable financial insights.',
  },
  {
    id: 'job-010',
    title: 'Customer Success Manager',
    department: 'Customer Success',
    location: 'Bengaluru',
    type: 'Full-time',
    status: 'Closed',
    openings: 1,
    applicants: 44,
    postedOn: '2026-03-01',
    hiringManagerId: 'emp-070',
    experience: '3–5 yrs',
    description:
      'Manage a portfolio of mid-market accounts, driving adoption, retention, and expansion revenue. Be the voice of the customer internally.',
  },
];

const JOB_OPENINGS_STORAGE_KEY = 'modcon.hr.jobOpenings';
export const JOB_OPENINGS_CHANGED_EVENT = 'modcon-hr-job-openings-changed';

function readStoredJobOpenings(): JobOpening[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(JOB_OPENINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JobOpening[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredJobOpenings(items: JobOpening[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(JOB_OPENINGS_STORAGE_KEY, JSON.stringify(items));
}

function notifyJobOpeningsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(JOB_OPENINGS_CHANGED_EVENT));
}

export function getJobOpenings(): JobOpening[] {
  return readStoredJobOpenings() ?? jobOpenings;
}

export function saveJobOpenings(items: JobOpening[]) {
  writeStoredJobOpenings(items);
  notifyJobOpeningsChanged();
}

export function addJobOpening(job: JobOpening) {
  const next = [job, ...getJobOpenings().filter((item) => item.id !== job.id)];
  saveJobOpenings(next);
  return next;
}

export function deleteJobOpening(jobId: string) {
  const next = getJobOpenings().filter((job) => job.id !== jobId);
  saveJobOpenings(next);
  return next;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export const candidates: Candidate[] = [
  // job-001 Senior Backend Engineer
  { id: 'cand-001', name: 'Abhishek Tiwari', email: 'abhishek.t@email.com', phone: '+91 9810001001', jobId: 'job-001', jobTitle: 'Senior Backend Engineer', stage: 'Applied', appliedOn: '2026-05-03', rating: 3, source: 'LinkedIn', currentCompany: 'Razorpay', experienceYears: 5 },
  { id: 'cand-002', name: 'Preethi Nair', email: 'preethi.n@email.com', phone: '+91 9810001002', jobId: 'job-001', jobTitle: 'Senior Backend Engineer', stage: 'Screening', appliedOn: '2026-05-05', rating: 4, source: 'Naukri', currentCompany: 'Freshworks', experienceYears: 6 },
  { id: 'cand-003', name: 'Sameer Joshi', email: 'sameer.j@email.com', phone: '+91 9810001003', jobId: 'job-001', jobTitle: 'Senior Backend Engineer', stage: 'Interview', appliedOn: '2026-05-06', rating: 5, source: 'LinkedIn', currentCompany: 'Swiggy', experienceYears: 7 },
  { id: 'cand-004', name: 'Divya Rajan', email: 'divya.r@email.com', phone: '+91 9810001004', jobId: 'job-001', jobTitle: 'Senior Backend Engineer', stage: 'Offer', appliedOn: '2026-05-02', rating: 5, source: 'Referral', currentCompany: 'Zepto', experienceYears: 6 },
  { id: 'cand-005', name: 'Kiran Murthy', email: 'kiran.m@email.com', phone: '+91 9810001005', jobId: 'job-001', jobTitle: 'Senior Backend Engineer', stage: 'Rejected', appliedOn: '2026-05-04', rating: 2, source: 'Website', currentCompany: 'Infosys', experienceYears: 4 },

  // job-002 Product Designer
  { id: 'cand-006', name: 'Tanvi Shah', email: 'tanvi.s@email.com', phone: '+91 9810001006', jobId: 'job-002', jobTitle: 'Product Designer', stage: 'Applied', appliedOn: '2026-05-10', rating: 4, source: 'LinkedIn', currentCompany: 'Zomato', experienceYears: 3 },
  { id: 'cand-007', name: 'Ritesh Kumar', email: 'ritesh.k@email.com', phone: '+91 9810001007', jobId: 'job-002', jobTitle: 'Product Designer', stage: 'Interview', appliedOn: '2026-05-09', rating: 4, source: 'Referral', currentCompany: 'Paytm', experienceYears: 4 },
  { id: 'cand-008', name: 'Pooja Sethi', email: 'pooja.s@email.com', phone: '+91 9810001008', jobId: 'job-002', jobTitle: 'Product Designer', stage: 'Hired', appliedOn: '2026-05-08', rating: 5, source: 'LinkedIn', currentCompany: 'Meesho', experienceYears: 5 },

  // job-003 Account Executive
  { id: 'cand-009', name: 'Mohit Arora', email: 'mohit.a@email.com', phone: '+91 9810001009', jobId: 'job-003', jobTitle: 'Account Executive – Enterprise', stage: 'Applied', appliedOn: '2026-04-20', rating: 3, source: 'Naukri', currentCompany: 'Salesforce', experienceYears: 6 },
  { id: 'cand-010', name: 'Neelam Gupta', email: 'neelam.g@email.com', phone: '+91 9810001010', jobId: 'job-003', jobTitle: 'Account Executive – Enterprise', stage: 'Screening', appliedOn: '2026-04-22', rating: 4, source: 'LinkedIn', currentCompany: 'SAP', experienceYears: 7 },
  { id: 'cand-011', name: 'Farhan Qureshi', email: 'farhan.q@email.com', phone: '+91 9810001011', jobId: 'job-003', jobTitle: 'Account Executive – Enterprise', stage: 'Interview', appliedOn: '2026-04-19', rating: 4, source: 'Referral', currentCompany: 'Oracle', experienceYears: 8 },
  { id: 'cand-012', name: 'Smita Kulkarni', email: 'smita.k@email.com', phone: '+91 9810001012', jobId: 'job-003', jobTitle: 'Account Executive – Enterprise', stage: 'Offer', appliedOn: '2026-04-18', rating: 5, source: 'LinkedIn', currentCompany: 'HubSpot', experienceYears: 6 },
  { id: 'cand-013', name: 'Vivek Srivastava', email: 'vivek.s@email.com', phone: '+91 9810001013', jobId: 'job-003', jobTitle: 'Account Executive – Enterprise', stage: 'Hired', appliedOn: '2026-04-17', rating: 5, source: 'Referral', currentCompany: 'Zoho', experienceYears: 7 },

  // job-004 SDR
  { id: 'cand-014', name: 'Ayush Mishra', email: 'ayush.m@email.com', phone: '+91 9810001014', jobId: 'job-004', jobTitle: 'Sales Development Representative', stage: 'Applied', appliedOn: '2026-05-15', rating: 3, source: 'Naukri', currentCompany: 'Freshsales', experienceYears: 1 },
  { id: 'cand-015', name: 'Roshni Patel', email: 'roshni.p@email.com', phone: '+91 9810001015', jobId: 'job-004', jobTitle: 'Sales Development Representative', stage: 'Screening', appliedOn: '2026-05-16', rating: 4, source: 'Website', currentCompany: 'LeadSquared', experienceYears: 2 },
  { id: 'cand-016', name: 'Deepak Choudhary', email: 'deepak.c@email.com', phone: '+91 9810001016', jobId: 'job-004', jobTitle: 'Sales Development Representative', stage: 'Interview', appliedOn: '2026-05-14', rating: 4, source: 'LinkedIn', currentCompany: 'Outplay', experienceYears: 2 },

  // job-005 HRBP
  { id: 'cand-017', name: 'Swati Dubey', email: 'swati.d@email.com', phone: '+91 9810001017', jobId: 'job-005', jobTitle: 'HR Business Partner', stage: 'Applied', appliedOn: '2026-05-22', rating: 3, source: 'LinkedIn', currentCompany: 'Wipro', experienceYears: 4 },
  { id: 'cand-018', name: 'Arun Nambiar', email: 'arun.n@email.com', phone: '+91 9810001018', jobId: 'job-005', jobTitle: 'HR Business Partner', stage: 'Interview', appliedOn: '2026-05-21', rating: 4, source: 'Referral', currentCompany: 'HCL', experienceYears: 5 },

  // job-006 Senior PM
  { id: 'cand-019', name: 'Kritika Sharma', email: 'kritika.s@email.com', phone: '+91 9810001019', jobId: 'job-006', jobTitle: 'Senior Product Manager', stage: 'Screening', appliedOn: '2026-04-27', rating: 4, source: 'LinkedIn', currentCompany: 'Flipkart', experienceYears: 6 },
  { id: 'cand-020', name: 'Nandan Rao', email: 'nandan.r@email.com', phone: '+91 9810001020', jobId: 'job-006', jobTitle: 'Senior Product Manager', stage: 'Interview', appliedOn: '2026-04-26', rating: 5, source: 'Referral', currentCompany: 'Razorpay', experienceYears: 7 },
  { id: 'cand-021', name: 'Preeti Bose', email: 'preeti.b@email.com', phone: '+91 9810001021', jobId: 'job-006', jobTitle: 'Senior Product Manager', stage: 'Offer', appliedOn: '2026-04-25', rating: 5, source: 'LinkedIn', currentCompany: 'Cred', experienceYears: 8 },

  // job-008 Content Strategist
  { id: 'cand-022', name: 'Bhavna Thapar', email: 'bhavna.t@email.com', phone: '+91 9810001022', jobId: 'job-008', jobTitle: 'Content Strategist & Writer', stage: 'Applied', appliedOn: '2026-05-29', rating: 3, source: 'Website', currentCompany: 'Sprinklr', experienceYears: 3 },
  { id: 'cand-023', name: 'Gaurav Menon', email: 'gaurav.m@email.com', phone: '+91 9810001023', jobId: 'job-008', jobTitle: 'Content Strategist & Writer', stage: 'Screening', appliedOn: '2026-05-30', rating: 4, source: 'LinkedIn', currentCompany: 'Clevertap', experienceYears: 3 },

  // job-010 CSM
  { id: 'cand-024', name: 'Leela Krishnaswamy', email: 'leela.k@email.com', phone: '+91 9810001024', jobId: 'job-010', jobTitle: 'Customer Success Manager', stage: 'Hired', appliedOn: '2026-03-05', rating: 5, source: 'Referral', currentCompany: 'Chargebee', experienceYears: 4 },
];

// ---------------------------------------------------------------------------
// Hiring Funnel aggregation
// ---------------------------------------------------------------------------

export interface FunnelStage {
  stage: CandidateStage;
  count: number;
}

export function hiringFunnel(): FunnelStage[] {
  const stages: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
  return stages.map((stage) => ({
    stage,
    count: candidates.filter((c) => c.stage === stage).length,
  }));
}
