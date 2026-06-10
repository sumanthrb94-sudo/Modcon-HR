import type { Employee, Department, EmploymentType, EmployeeStatus, Gender } from '@/types';

// ---------------------------------------------------------------------------
// Master employee directory — the single source of truth for people data.
// Every other module (attendance, leave, payroll, etc.) references these IDs.
// ---------------------------------------------------------------------------

interface Seed {
  code: string;
  first: string;
  last: string;
  gender: Gender;
  designation: string;
  department: Department;
  location: string;
  type: EmploymentType;
  status: EmployeeStatus;
  doj: string;
  dob: string;
  managerId: string | null;
  ctc: number;
  skills: string[];
}

const seeds: Seed[] = [
  // Leadership
  { code: 'MC-001', first: 'Aarav', last: 'Sharma', gender: 'Male', designation: 'Chief Executive Officer', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2019-03-01', dob: '1982-06-12', managerId: null, ctc: 9600000, skills: ['Leadership', 'Strategy', 'Fundraising'] },
  { code: 'MC-002', first: 'Diya', last: 'Mehta', gender: 'Female', designation: 'VP of Engineering', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2019-07-15', dob: '1985-02-20', managerId: 'emp-001', ctc: 7200000, skills: ['Architecture', 'Team Building', 'Cloud'] },
  { code: 'MC-003', first: 'Rohan', last: 'Iyer', gender: 'Male', designation: 'VP of Product', department: 'Product', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2020-01-10', dob: '1986-11-05', managerId: 'emp-001', ctc: 6800000, skills: ['Product Strategy', 'Roadmapping'] },
  { code: 'MC-004', first: 'Ananya', last: 'Reddy', gender: 'Female', designation: 'Head of People', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2020-02-01', dob: '1987-09-18', managerId: 'emp-001', ctc: 5400000, skills: ['HR Strategy', 'Culture', 'Hiring'] },
  { code: 'MC-005', first: 'Vikram', last: 'Nair', gender: 'Male', designation: 'VP of Sales', department: 'Sales', location: 'Delhi', type: 'Full-time', status: 'Active', doj: '2020-05-20', dob: '1984-04-22', managerId: 'emp-001', ctc: 6600000, skills: ['Enterprise Sales', 'GTM'] },
  { code: 'MC-006', first: 'Priya', last: 'Kapoor', gender: 'Female', designation: 'Head of Finance', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2020-06-15', dob: '1983-12-30', managerId: 'emp-001', ctc: 6200000, skills: ['FP&A', 'Compliance'] },

  // Engineering
  { code: 'MC-010', first: 'Karthik', last: 'Subramaniam', gender: 'Male', designation: 'Engineering Manager', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2020-08-01', dob: '1988-07-14', managerId: 'emp-002', ctc: 4800000, skills: ['Backend', 'Distributed Systems', 'Go'] },
  { code: 'MC-011', first: 'Sneha', last: 'Patil', gender: 'Female', designation: 'Senior Software Engineer', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-02-10', dob: '1991-03-08', managerId: 'emp-010', ctc: 3600000, skills: ['React', 'TypeScript', 'Node'] },
  { code: 'MC-012', first: 'Arjun', last: 'Verma', gender: 'Male', designation: 'Software Engineer', department: 'Engineering', location: 'Pune', type: 'Full-time', status: 'Active', doj: '2022-06-01', dob: '1995-10-25', managerId: 'emp-010', ctc: 2400000, skills: ['Java', 'Spring', 'Kafka'] },
  { code: 'MC-013', first: 'Meera', last: 'Krishnan', gender: 'Female', designation: 'Senior Software Engineer', department: 'Engineering', location: 'Bengaluru', type: 'Full-time', status: 'On Leave', doj: '2021-04-12', dob: '1990-08-19', managerId: 'emp-010', ctc: 3800000, skills: ['Python', 'ML', 'AWS'] },
  { code: 'MC-014', first: 'Rahul', last: 'Deshpande', gender: 'Male', designation: 'DevOps Engineer', department: 'Engineering', location: 'Pune', type: 'Full-time', status: 'Active', doj: '2022-01-17', dob: '1993-05-30', managerId: 'emp-010', ctc: 2800000, skills: ['Kubernetes', 'Terraform', 'CI/CD'] },
  { code: 'MC-015', first: 'Ishaan', last: 'Gupta', gender: 'Male', designation: 'Software Engineer Intern', department: 'Engineering', location: 'Bengaluru', type: 'Intern', status: 'Probation', doj: '2026-01-05', dob: '2002-11-11', managerId: 'emp-010', ctc: 600000, skills: ['React', 'CSS'] },
  { code: 'MC-016', first: 'Tara', last: 'Joshi', gender: 'Female', designation: 'QA Engineer', department: 'Engineering', location: 'Pune', type: 'Full-time', status: 'Active', doj: '2021-09-20', dob: '1992-02-14', managerId: 'emp-010', ctc: 2200000, skills: ['Automation', 'Cypress', 'QA'] },

  // Product & Design
  { code: 'MC-020', first: 'Nisha', last: 'Bhatt', gender: 'Female', designation: 'Senior Product Manager', department: 'Product', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2021-03-15', dob: '1989-06-27', managerId: 'emp-003', ctc: 4200000, skills: ['Analytics', 'Discovery', 'SQL'] },
  { code: 'MC-021', first: 'Aditya', last: 'Rao', gender: 'Male', designation: 'Product Manager', department: 'Product', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2022-08-01', dob: '1992-09-09', managerId: 'emp-003', ctc: 3200000, skills: ['Roadmap', 'A/B Testing'] },
  { code: 'MC-022', first: 'Kavya', last: 'Menon', gender: 'Female', designation: 'Lead Product Designer', department: 'Design', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-01-25', dob: '1990-12-03', managerId: 'emp-003', ctc: 3800000, skills: ['Figma', 'Design Systems', 'UX'] },
  { code: 'MC-023', first: 'Dev', last: 'Saxena', gender: 'Male', designation: 'Product Designer', department: 'Design', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2022-11-10', dob: '1994-07-21', managerId: 'emp-022', ctc: 2600000, skills: ['UI', 'Prototyping', 'Illustration'] },

  // Sales
  { code: 'MC-030', first: 'Sanjay', last: 'Malhotra', gender: 'Male', designation: 'Sales Manager', department: 'Sales', location: 'Delhi', type: 'Full-time', status: 'Active', doj: '2021-02-01', dob: '1987-01-15', managerId: 'emp-005', ctc: 3600000, skills: ['Negotiation', 'CRM'] },
  { code: 'MC-031', first: 'Pooja', last: 'Agarwal', gender: 'Female', designation: 'Account Executive', department: 'Sales', location: 'Delhi', type: 'Full-time', status: 'Active', doj: '2022-04-18', dob: '1993-08-08', managerId: 'emp-030', ctc: 2400000, skills: ['Closing', 'Demos'] },
  { code: 'MC-032', first: 'Rishi', last: 'Khanna', gender: 'Male', designation: 'Sales Development Rep', department: 'Sales', location: 'Gurugram', type: 'Full-time', status: 'Notice Period', doj: '2023-01-09', dob: '1996-03-19', managerId: 'emp-030', ctc: 1800000, skills: ['Prospecting', 'Outreach'] },
  { code: 'MC-033', first: 'Anjali', last: 'Singh', gender: 'Female', designation: 'Account Executive', department: 'Sales', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-07-22', dob: '1992-11-28', managerId: 'emp-030', ctc: 2500000, skills: ['Enterprise', 'Upsell'] },

  // Marketing
  { code: 'MC-040', first: 'Neha', last: 'Chopra', gender: 'Female', designation: 'Marketing Manager', department: 'Marketing', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2021-06-01', dob: '1990-04-04', managerId: 'emp-005', ctc: 3400000, skills: ['Brand', 'Content', 'SEO'] },
  { code: 'MC-041', first: 'Varun', last: 'Pillai', gender: 'Male', designation: 'Content Strategist', department: 'Marketing', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2022-09-12', dob: '1994-02-17', managerId: 'emp-040', ctc: 2000000, skills: ['Copywriting', 'Storytelling'] },
  { code: 'MC-042', first: 'Simran', last: 'Kaur', gender: 'Female', designation: 'Performance Marketer', department: 'Marketing', location: 'Bengaluru', type: 'Contract', status: 'Active', doj: '2023-03-01', dob: '1995-09-23', managerId: 'emp-040', ctc: 1900000, skills: ['Paid Ads', 'Analytics'] },

  // HR
  { code: 'MC-050', first: 'Ritu', last: 'Bansal', gender: 'Female', designation: 'HR Business Partner', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2021-05-10', dob: '1989-10-10', managerId: 'emp-004', ctc: 3000000, skills: ['Employee Relations', 'Policy'] },
  { code: 'MC-051', first: 'Amit', last: 'Trivedi', gender: 'Male', designation: 'Talent Acquisition Lead', department: 'Human Resources', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-08-16', dob: '1988-12-12', managerId: 'emp-004', ctc: 3200000, skills: ['Recruiting', 'Sourcing'] },
  { code: 'MC-052', first: 'Sara', last: 'Khan', gender: 'Female', designation: 'HR Executive', department: 'Human Resources', location: 'Hyderabad', type: 'Full-time', status: 'Active', doj: '2023-02-20', dob: '1997-06-06', managerId: 'emp-050', ctc: 1600000, skills: ['Onboarding', 'Payroll Ops'] },

  // Finance & Ops
  { code: 'MC-060', first: 'Manish', last: 'Goyal', gender: 'Male', designation: 'Financial Analyst', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2021-11-08', dob: '1991-07-07', managerId: 'emp-006', ctc: 2400000, skills: ['Modeling', 'Excel'] },
  { code: 'MC-061', first: 'Divya', last: 'Pandey', gender: 'Female', designation: 'Accountant', department: 'Finance', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-03-14', dob: '1993-01-29', managerId: 'emp-006', ctc: 1700000, skills: ['Accounting', 'GST'] },
  { code: 'MC-062', first: 'Harsh', last: 'Mehra', gender: 'Male', designation: 'Operations Manager', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-07-19', dob: '1989-05-16', managerId: 'emp-001', ctc: 3400000, skills: ['Process', 'Vendor Mgmt'] },
  { code: 'MC-063', first: 'Lakshmi', last: 'Venkat', gender: 'Female', designation: 'Office Administrator', department: 'Operations', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2022-05-03', dob: '1990-03-25', managerId: 'emp-062', ctc: 1400000, skills: ['Admin', 'Facilities'] },

  // Customer Success
  { code: 'MC-070', first: 'Gaurav', last: 'Sinha', gender: 'Male', designation: 'Customer Success Manager', department: 'Customer Success', location: 'Bengaluru', type: 'Full-time', status: 'Active', doj: '2021-10-11', dob: '1990-08-30', managerId: 'emp-005', ctc: 3000000, skills: ['Retention', 'Onboarding'] },
  { code: 'MC-071', first: 'Ayesha', last: 'Sheikh', gender: 'Female', designation: 'Support Specialist', department: 'Customer Success', location: 'Remote', type: 'Full-time', status: 'Active', doj: '2022-12-05', dob: '1996-04-13', managerId: 'emp-070', ctc: 1500000, skills: ['Support', 'Zendesk'] },
  { code: 'MC-072', first: 'Nikhil', last: 'Bose', gender: 'Male', designation: 'Implementation Specialist', department: 'Customer Success', location: 'Kolkata', type: 'Full-time', status: 'Active', doj: '2023-04-24', dob: '1994-11-02', managerId: 'emp-070', ctc: 1800000, skills: ['Integrations', 'Training'] },

  // Legal
  { code: 'MC-080', first: 'Shreya', last: 'Desai', gender: 'Female', designation: 'Legal Counsel', department: 'Legal', location: 'Mumbai', type: 'Full-time', status: 'Active', doj: '2022-02-28', dob: '1988-09-21', managerId: 'emp-006', ctc: 4000000, skills: ['Contracts', 'Compliance'] },
];

export const employees: Employee[] = seeds.map((s, idx) => {
  const id = `emp-${String(idx + 1).padStart(3, '0')}`;
  return {
    id,
    employeeCode: s.code,
    firstName: s.first,
    lastName: s.last,
    fullName: `${s.first} ${s.last}`,
    email: `${s.first.toLowerCase()}.${s.last.toLowerCase()}@modcon.com`,
    phone: `+91 ${90000 + idx}${String(10000 + idx * 7).slice(0, 5)}`,
    avatar: `${s.first} ${s.last}`,
    gender: s.gender,
    dateOfBirth: s.dob,
    designation: s.designation,
    department: s.department,
    location: s.location,
    employmentType: s.type,
    status: s.status,
    dateOfJoining: s.doj,
    reportingManagerId: s.managerId,
    ctc: s.ctc,
    bloodGroup: ['O+', 'A+', 'B+', 'AB+', 'O-'][idx % 5],
    maritalStatus: idx % 3 === 0 ? 'Married' : 'Single',
    address: `${s.location}, India`,
    skills: s.skills,
  };
});

// Resolve manager names now that ids are stable.
const byId = new Map(employees.map((e) => [e.id, e]));
employees.forEach((e) => {
  e.reportingManagerName = e.reportingManagerId ? byId.get(e.reportingManagerId)?.fullName : undefined;
});

export const getEmployee = (id: string): Employee | undefined => byId.get(id);

export const getEmployeeName = (id: string): string => byId.get(id)?.fullName ?? 'Unknown';

export const departments: Department[] = [
  'Engineering',
  'Product',
  'Design',
  'Sales',
  'Marketing',
  'Human Resources',
  'Finance',
  'Operations',
  'Customer Success',
  'Legal',
];

export const locations = Array.from(new Set(employees.map((e) => e.location))).sort();
