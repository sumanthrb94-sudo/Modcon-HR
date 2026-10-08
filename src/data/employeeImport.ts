import type { EmploymentType, Gender } from '@/types';

/**
 * Reading a team out of a spreadsheet, for the guided setup.
 *
 * Pure — it imports nothing but types — so `npm run test:unit` exercises it
 * directly, and nothing is written from here: the caller shows the result and
 * an administrator confirms it.
 *
 * ## The same rules as Add Employee
 *
 * A person imported from a file is the same person Add Employee would have
 * created, so the file is held to the same fields: name, work email,
 * designation, department, location, date of birth, date of joining and an
 * annual CTC above zero. Relaxing that here would make the import the easy way
 * to create the half-filled records the form exists to prevent — somebody with
 * no CTC shows ₹0 across payroll, and somebody with no date of birth is missing
 * from statutory records.
 *
 * ## Reported, never dropped
 *
 * Every row that cannot be used is listed with the reason, the same rule every
 * other upload in this app follows: a line silently ignored looks exactly like a
 * line imported, and the person it named simply never appears.
 *
 * ## Columns are found by their header, not their position
 *
 * The file is whatever HR exported from the spreadsheet they already keep, so
 * the header row is required and read by name (with the obvious aliases), in
 * any order, with extra columns ignored. A fixed column order is a file nobody
 * has, and getting two columns the wrong way round would import every person
 * with somebody else's department.
 */

/** The template offered for download. Any column order is accepted. */
export const EMPLOYEE_IMPORT_CSV_HEADER =
  'first_name,last_name,email,designation,department,location,date_of_birth,date_of_joining,annual_ctc,employment_type,gender,phone,employee_code';

export const EMPLOYEE_IMPORT_CSV_EXAMPLE =
  'Priya,Sharma,priya.sharma@example.com,Accountant,Finance,Pune,1994-03-12,2023-06-01,650000,Full-time,Female,9876543210,';

export interface ImportedEmployee {
  employeeCode: string;
  /** True when the file left the code blank and one was suggested. */
  codeSuggested: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  gender?: Gender;
  dateOfBirth: string;
  dateOfJoining: string;
  ctc: number;
}

export interface EmployeeImportRow {
  /** 1-based line in the file, for the review list. */
  line: number;
  employee: ImportedEmployee;
}

export interface EmployeeImportMiss {
  line: number;
  text: string;
  reason: string;
}

export interface EmployeeImportResult {
  rows: EmployeeImportRow[];
  unmatched: EmployeeImportMiss[];
  /** Set when the file as a whole cannot be read — no header, or a required column missing. */
  fileError: string | null;
}

/** Who already exists, so a row cannot create them a second time. */
export interface ExistingPerson {
  email: string;
  employeeCode?: string;
}

type Field =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'designation'
  | 'department'
  | 'location'
  | 'dateOfBirth'
  | 'dateOfJoining'
  | 'ctc'
  | 'employmentType'
  | 'gender'
  | 'phone'
  | 'employeeCode';

/** Header spellings, compared after lowercasing and stripping everything but letters. */
const HEADER_ALIASES: Record<Field, string[]> = {
  firstName: ['firstname', 'first', 'givenname'],
  lastName: ['lastname', 'last', 'surname', 'familyname'],
  fullName: ['name', 'fullname', 'employeename'],
  email: ['email', 'workemail', 'emailaddress', 'officialemail', 'emailid'],
  designation: ['designation', 'jobtitle', 'title', 'role', 'position'],
  department: ['department', 'dept', 'team'],
  location: ['location', 'worklocation', 'office', 'branch', 'site'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'birthday'],
  dateOfJoining: ['dateofjoining', 'doj', 'joiningdate', 'joinedon', 'startdate'],
  ctc: ['annualctc', 'ctc', 'ctcannual', 'annualsalary', 'salary'],
  employmentType: ['employmenttype', 'type', 'employeetype'],
  gender: ['gender', 'sex'],
  phone: ['phone', 'mobile', 'phonenumber', 'mobilenumber', 'contact'],
  employeeCode: ['employeecode', 'empcode', 'code', 'employeeid', 'empid', 'staffid'],
};

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * One CSV line into cells, honouring double quotes.
 *
 * Spreadsheets quote any cell holding a comma — "Sharma, Priya", "6,50,000" —
 * so a plain split would shift every column after it. A doubled quote inside a
 * quoted cell is a literal quote. Records spanning lines are not supported; a
 * staff list has no reason to contain a newline inside a cell.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * A date as a spreadsheet in India writes it, as `YYYY-MM-DD`.
 *
 * ISO is taken as it is. Anything slashed or dashed with the year last is read
 * **day first** — 03/04/2024 is the 3rd of April here, never March the 4th — and
 * a date that does not exist (31/02) is refused rather than rolled into March.
 */
export function parseImportDate(value: string): string | null {
  const clean = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(clean);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isRealDate(year, month, day) ? iso(year, month, day) : null;
  }
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(clean);
  if (match) {
    const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isRealDate(year, month, day) ? iso(year, month, day) : null;
  }
  return null;
}

/** "6,50,000", "₹650000", "650000.00" → 650000. Lakh grouping is ordinary here. */
export function parseImportAmount(value: string): number | null {
  const clean = value.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

function parseEmploymentType(value: string): EmploymentType | null {
  const clean = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (clean === '' || clean === 'fulltime' || clean === 'permanent') return 'Full-time';
  if (clean === 'parttime') return 'Part-time';
  if (clean === 'contract' || clean === 'contractor' || clean === 'consultant') return 'Contract';
  if (clean === 'intern' || clean === 'internship' || clean === 'trainee') return 'Intern';
  return null;
}

function parseGender(value: string): Gender | undefined | null {
  const clean = value.trim().toLowerCase();
  if (clean === '') return undefined;
  if (clean === 'm' || clean === 'male') return 'Male';
  if (clean === 'f' || clean === 'female') return 'Female';
  if (clean === 'other' || clean === 'o') return 'Other';
  return null;
}

/** Codes compare on characters, not punctuation or case — the rule every code matcher here uses. */
function squashCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Read a staff spreadsheet exported as CSV.
 *
 * `existing` is the directory as it stands, so a row naming somebody already
 * here — by email or by code — is refused rather than creating them twice.
 * `suggestCode(ahead)` numbers people whose code the file left blank, `ahead`
 * counting the suggestions already handed out so two rows never get the same
 * one; a suggested code that collides with one the file typed is skipped.
 * `today` (`YYYY-MM-DD`) refuses a date of birth in the future, as the form does.
 */
export function parseEmployeeImportCsv(
  text: string,
  existing: ExistingPerson[],
  suggestCode: (ahead: number) => string,
  today: string,
): EmployeeImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== '');
  if (headerIndex === -1) {
    return { rows: [], unmatched: [], fileError: 'The file is empty.' };
  }

  const headerCells = splitCsvLine(lines[headerIndex]).map(headerKey);
  const columns = new Map<Field, number>();
  (Object.keys(HEADER_ALIASES) as Field[]).forEach((field) => {
    const index = headerCells.findIndex((cell) => HEADER_ALIASES[field].includes(cell));
    if (index !== -1) columns.set(field, index);
  });

  const hasName = columns.has('firstName') || columns.has('fullName');
  const missing: string[] = [];
  if (!hasName) missing.push('first_name (or name)');
  for (const [field, label] of [
    ['email', 'email'],
    ['designation', 'designation'],
    ['department', 'department'],
    ['location', 'location'],
    ['dateOfBirth', 'date_of_birth'],
    ['dateOfJoining', 'date_of_joining'],
    ['ctc', 'annual_ctc'],
  ] as const) {
    if (!columns.has(field)) missing.push(label);
  }
  if (missing.length > 0) {
    return {
      rows: [],
      unmatched: [],
      fileError: `The first row must be a header naming each column. Missing: ${missing.join(', ')}.`,
    };
  }

  const takenEmails = new Map<string, string>();
  for (const person of existing) {
    if (person.email) takenEmails.set(person.email.trim().toLowerCase(), 'already in your directory');
  }
  const takenCodes = new Map<string, string>();
  for (const person of existing) {
    const code = squashCode(person.employeeCode ?? '');
    if (code) takenCodes.set(code, 'already belongs to somebody in your directory');
  }

  // Codes the file types itself are reserved before any are suggested, so a
  // suggestion on line 3 cannot take the code line 9 asked for.
  lines.forEach((raw, index) => {
    if (index <= headerIndex || raw.trim() === '') return;
    const column = columns.get('employeeCode');
    if (column === undefined) return;
    const code = squashCode(splitCsvLine(raw)[column] ?? '');
    if (code && !takenCodes.has(code)) takenCodes.set(code, `is also used on line ${index + 1}`);
  });

  const rows: EmployeeImportRow[] = [];
  const unmatched: EmployeeImportMiss[] = [];
  const codesClaimed = new Map<string, number>();
  let ahead = 0;

  lines.forEach((raw, index) => {
    if (index <= headerIndex) return;
    const line = index + 1;
    const text = raw.trim();
    if (text === '') return;
    const cells = splitCsvLine(raw);
    const cell = (field: Field): string => {
      const column = columns.get(field);
      return column === undefined ? '' : (cells[column] ?? '').trim();
    };
    const refuse = (reason: string) => unmatched.push({ line, text, reason });

    let firstName = cell('firstName');
    let lastName = cell('lastName');
    if (!firstName && cell('fullName')) {
      const parts = cell('fullName').split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = lastName || parts.slice(1).join(' ');
    }
    if (!firstName) return refuse('First name is missing.');
    if (!lastName) return refuse('Last name is missing.');

    const email = cell('email').toLowerCase();
    if (!email) return refuse('Work email is missing.');
    if (!EMAIL_PATTERN.test(email)) return refuse(`"${email}" is not a valid email address.`);
    const emailTaken = takenEmails.get(email);
    if (emailTaken) return refuse(`${email} is ${emailTaken}.`);

    const designation = cell('designation');
    if (!designation) return refuse('Designation is missing.');
    const department = cell('department');
    if (!department) return refuse('Department is missing.');
    const location = cell('location');
    if (!location) return refuse('Location is missing.');

    if (!cell('dateOfBirth')) return refuse('Date of birth is missing.');
    const dateOfBirth = parseImportDate(cell('dateOfBirth'));
    if (!dateOfBirth) return refuse(`Date of birth "${cell('dateOfBirth')}" is not a date — use YYYY-MM-DD or DD/MM/YYYY.`);
    if (dateOfBirth > today) return refuse('Date of birth is in the future.');

    if (!cell('dateOfJoining')) return refuse('Date of joining is missing.');
    const dateOfJoining = parseImportDate(cell('dateOfJoining'));
    if (!dateOfJoining) return refuse(`Date of joining "${cell('dateOfJoining')}" is not a date — use YYYY-MM-DD or DD/MM/YYYY.`);

    if (!cell('ctc')) return refuse('Annual CTC is missing.');
    const ctc = parseImportAmount(cell('ctc'));
    if (ctc === null || ctc <= 0) return refuse(`Annual CTC "${cell('ctc')}" must be an amount above zero.`);

    const employmentType = parseEmploymentType(cell('employmentType'));
    if (!employmentType) {
      return refuse(`Employment type "${cell('employmentType')}" is not one of Full-time, Part-time, Contract or Intern.`);
    }
    const gender = parseGender(cell('gender'));
    if (gender === null) return refuse(`Gender "${cell('gender')}" is not one of Male, Female or Other.`);

    let employeeCode = cell('employeeCode');
    let codeSuggested = false;
    if (employeeCode) {
      const code = squashCode(employeeCode);
      const claimedBy = codesClaimed.get(code);
      if (claimedBy !== undefined) return refuse(`Employee code ${employeeCode} is also used on line ${claimedBy}.`);
      const owner = takenCodes.get(code);
      if (owner && owner.startsWith('already')) return refuse(`Employee code ${employeeCode} ${owner}.`);
      codesClaimed.set(code, line);
    } else {
      // Bounded: each pass either returns or moves `ahead` on, and only codes
      // already reserved can be skipped.
      for (let guard = 0; guard < 10_000; guard += 1) {
        const candidate = suggestCode(ahead);
        ahead += 1;
        const code = squashCode(candidate);
        if (!takenCodes.has(code) && !codesClaimed.has(code)) {
          employeeCode = candidate;
          codesClaimed.set(code, line);
          break;
        }
      }
      if (!employeeCode) return refuse('No free employee code could be suggested — type one in the file.');
      codeSuggested = true;
    }

    takenEmails.set(email, `also on line ${line}`);
    rows.push({
      line,
      employee: {
        employeeCode,
        codeSuggested,
        firstName,
        lastName,
        email,
        phone: cell('phone'),
        designation,
        department,
        location,
        employmentType,
        gender,
        dateOfBirth,
        dateOfJoining,
        ctc,
      },
    });
  });

  return { rows, unmatched, fileError: null };
}
