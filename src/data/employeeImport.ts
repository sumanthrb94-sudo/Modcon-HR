import type { EmploymentType, Gender } from '@/types';

/**
 * Reading a team out of a spreadsheet, for the guided setup.
 *
 * Pure — it imports nothing but types — so `npm run test:unit` exercises it
 * directly, and nothing is written from here: the caller shows the result and
 * an administrator confirms it.
 *
 * ## Shaped by a real office's spreadsheet
 *
 * The first version held every row to Add Employee's form, and a simulated
 * 22-person Pune contractor lost seven of them on the first upload: a site
 * supervisor known by one name, a helper with no email address, a date Excel
 * had written as "12-Mar-1993", a blank date of birth, "4.2 LPA" in the CTC
 * column, two people sharing info@, and HR's own row. Each of those is
 * ordinary in an Indian office, and refusing them sent HR back to retype the
 * spreadsheet into a form one person at a time. So:
 *
 * - **What payroll needs is still required**: a name, designation, department,
 *   location, joining date, and an annual CTC that is plausibly annual.
 * - **What only some people have is optional, and said so per row**: a last
 *   name, an email (no email means no login — HR marks their attendance), a
 *   date of birth, PAN/UAN/bank details. A row missing one is imported with a
 *   note naming what to add later, rather than refused.
 * - **A Reporting Manager column is read**, by name, email or code, against the
 *   file and the directory. It used to be ignored without a word, which broke
 *   this module's own rule and left HR setting managers profile by profile.
 *
 * ## Reported, never dropped
 *
 * Every row that cannot be used is listed with the reason, and every row that
 * is used but incomplete carries its notes. A line silently ignored — or a
 * column — looks exactly like one applied.
 *
 * ## Columns are found by their header, not their position
 *
 * The file is whatever HR exported from the spreadsheet they already keep, so
 * the header row is required and read by name (with the obvious aliases), in
 * any order, with extra columns ignored.
 */

/** The template offered for download. Any column order is accepted. */
export const EMPLOYEE_IMPORT_CSV_HEADER =
  'first_name,last_name,email,designation,department,location,date_of_birth,date_of_joining,annual_ctc,employment_type,gender,phone,employee_code,reporting_manager,pan,uan,bank_account,ifsc';

export const EMPLOYEE_IMPORT_CSV_EXAMPLE =
  'Priya,Sharma,priya.sharma@example.com,Accountant,Finance,Pune,1994-03-12,2023-06-01,650000,Full-time,Female,9876543210,,,ABCDE1234F,,,';

/**
 * Below this an annual CTC is almost certainly a monthly figure typed in the
 * annual column — ₹15,000 for an intern's stipend became ₹1,250 a month in the
 * simulation, with nothing said. A year's minimum wage anywhere in India is
 * well above it, so a real annual figure this low does not occur.
 */
export const MIN_PLAUSIBLE_ANNUAL_CTC = 50_000;

export interface ImportedEmployee {
  employeeCode: string;
  /** True when the file left the code blank and one was suggested. */
  codeSuggested: boolean;
  firstName: string;
  /** '' for somebody known by one name. */
  lastName: string;
  /** '' for somebody without an email address — they get no login. */
  email: string;
  phone: string;
  designation: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  gender?: Gender;
  /** '' when the file did not have it. */
  dateOfBirth: string;
  dateOfJoining: string;
  ctc: number;
  pan?: string;
  uan?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
}

/** Who a row named as their manager, once resolved. */
export type ManagerReference =
  | { kind: 'file'; line: number }
  | { kind: 'directory'; id: string };

export interface EmployeeImportRow {
  /** 1-based line in the file, for the review list. */
  line: number;
  employee: ImportedEmployee;
  manager?: ManagerReference;
  /** Imported, but incomplete or partly unusable — each says what to do. */
  notes: string[];
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

/** Who already exists, so a row cannot create them a second time — and can name them as a manager. */
export interface ExistingPerson {
  id?: string;
  email: string;
  employeeCode?: string;
  fullName?: string;
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
  | 'employeeCode'
  | 'manager'
  | 'pan'
  | 'uan'
  | 'bankAccount'
  | 'ifsc';

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
  manager: ['reportingmanager', 'manager', 'reportsto', 'managername', 'manageremail', 'managercode', 'reportingto'],
  pan: ['pan', 'panno', 'pannumber', 'pancard'],
  uan: ['uan', 'uanno', 'uannumber', 'pfuan'],
  bankAccount: ['bankaccount', 'bankaccountnumber', 'accountnumber', 'bankacno', 'acno', 'accountno', 'bankaccountno'],
  ifsc: ['ifsc', 'ifsccode', 'bankifsc'],
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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date as a spreadsheet in India writes it, as `YYYY-MM-DD`.
 *
 * ISO is taken as it is. Anything numeric with the year last is read **day
 * first** — 03/04/2024 is the 3rd of April here, never March the 4th. Excel's
 * own display formats with a month name ("12-Mar-1993", "12 March 1993") are
 * read too. A two-digit year is refused rather than guessed: "93" could be a
 * birth year and "23" a joining year, and the century is not ours to pick. A
 * date that does not exist (31/02) is refused rather than rolled into March.
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
  match = /^(\d{1,2})[\s/.-]+([a-z]+)[\s/.,-]+(\d{4})$/i.exec(clean);
  if (match) {
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    const [day, year] = [Number(match[1]), Number(match[3])];
    return month > 0 && isRealDate(year, month, day) ? iso(year, month, day) : null;
  }
  return null;
}

/**
 * An annual amount as people write it: "6,50,000", "₹650000", "650000.00",
 * and in lakhs — "4.2 LPA", "4.2 lakh", "4.2L". Lakh grouping and lakh
 * shorthand are both ordinary on an Indian salary sheet.
 */
export function parseImportAmount(value: string): number | null {
  const compact = value.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '').toLowerCase();
  const lakh = /^(\d+(?:\.\d+)?)(?:lpa|lakhs?|lacs?|l)$/.exec(compact);
  if (lakh) return Math.round(Number(lakh[1]) * 100_000);
  if (!/^\d+(\.\d+)?$/.test(compact)) return null;
  return Number(compact);
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

function normalName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Read a staff spreadsheet exported as CSV.
 *
 * `existing` is the directory as it stands, so a row naming somebody already
 * here — by email or by code — is refused rather than creating them twice, and
 * so a Reporting Manager cell can name somebody already here.
 * `suggestCode(ahead)` numbers people whose code the file left blank, `ahead`
 * counting the suggestions already handed out so two rows never get the same
 * one; a suggested code that collides with one the file typed is skipped.
 * `today` (`YYYY-MM-DD`) refuses a date of birth in the future.
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
    ['designation', 'designation'],
    ['department', 'department'],
    ['location', 'location'],
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
  const managerCells = new Map<number, string>();
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
    const notes: string[] = [];

    let firstName = cell('firstName');
    let lastName = cell('lastName');
    if (!firstName && cell('fullName')) {
      const parts = cell('fullName').split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = lastName || parts.slice(1).join(' ');
    }
    if (!firstName) return refuse('Name is missing.');

    const email = cell('email').toLowerCase();
    if (email) {
      if (!EMAIL_PATTERN.test(email)) return refuse(`"${email}" is not a valid email address — fix it, or leave it blank for somebody with none.`);
      const emailTaken = takenEmails.get(email);
      if (emailTaken) {
        return refuse(
          emailTaken.startsWith('already')
            ? `${email} is ${emailTaken}.`
            : `${email} is ${emailTaken}. A login belongs to one person — leave it blank for whoever does not sign in with it.`,
        );
      }
    } else {
      notes.push('No email — they will not have a login. HR can mark their attendance.');
    }

    const designation = cell('designation');
    if (!designation) return refuse('Designation is missing.');
    const department = cell('department');
    if (!department) return refuse('Department is missing.');
    const location = cell('location');
    if (!location) return refuse('Location is missing.');

    let dateOfBirth = '';
    if (cell('dateOfBirth')) {
      const parsed = parseImportDate(cell('dateOfBirth'));
      if (!parsed) return refuse(`Date of birth "${cell('dateOfBirth')}" is not a date — use DD/MM/YYYY, YYYY-MM-DD or 12-Mar-1993.`);
      if (parsed > today) return refuse('Date of birth is in the future.');
      dateOfBirth = parsed;
    } else {
      notes.push('No date of birth — add it on their profile; statutory records need it.');
    }

    if (!cell('dateOfJoining')) return refuse('Date of joining is missing.');
    const dateOfJoining = parseImportDate(cell('dateOfJoining'));
    if (!dateOfJoining) return refuse(`Date of joining "${cell('dateOfJoining')}" is not a date — use DD/MM/YYYY, YYYY-MM-DD or 12-Mar-1993.`);

    if (!cell('ctc')) return refuse('Annual CTC is missing.');
    const ctc = parseImportAmount(cell('ctc'));
    if (ctc === null || ctc <= 0) return refuse(`Annual CTC "${cell('ctc')}" must be an amount above zero, like 480000 or 4.8 LPA.`);
    if (ctc < MIN_PLAUSIBLE_ANNUAL_CTC) {
      return refuse(
        `Annual CTC ₹${ctc.toLocaleString('en-IN')} looks like a monthly figure — a year's pay would be ₹${(ctc * 12).toLocaleString('en-IN')}. Enter the annual amount.`,
      );
    }

    const employmentType = parseEmploymentType(cell('employmentType'));
    if (!employmentType) {
      return refuse(`Employment type "${cell('employmentType')}" is not one of Full-time, Part-time, Contract or Intern.`);
    }
    const gender = parseGender(cell('gender'));
    if (gender === null) return refuse(`Gender "${cell('gender')}" is not one of Male, Female or Other.`);

    // Statutory identifiers: optional, and a malformed one is left off with a
    // note rather than costing the whole row — the person still needs paying.
    const pan = cell('pan').toUpperCase().replace(/\s/g, '');
    if (pan && !PAN_PATTERN.test(pan)) notes.push(`PAN "${cell('pan')}" is not a valid PAN — left blank.`);
    const uan = cell('uan').replace(/\s/g, '');
    if (uan && !/^\d{12}$/.test(uan)) notes.push(`UAN "${cell('uan')}" is not 12 digits — left blank.`);
    const bankAccountNumber = cell('bankAccount').replace(/[\s-]/g, '');
    if (bankAccountNumber && !/^\d{9,18}$/.test(bankAccountNumber)) notes.push(`Bank account "${cell('bankAccount')}" is not 9–18 digits — left blank.`);
    const bankIfsc = cell('ifsc').toUpperCase().replace(/\s/g, '');
    if (bankIfsc && !IFSC_PATTERN.test(bankIfsc)) notes.push(`IFSC "${cell('ifsc')}" is not a valid IFSC — left blank.`);

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

    if (email) takenEmails.set(email, `also on line ${line}`);
    if (cell('manager')) managerCells.set(line, cell('manager'));
    rows.push({
      line,
      notes,
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
        ...(pan && PAN_PATTERN.test(pan) ? { pan } : {}),
        ...(uan && /^\d{12}$/.test(uan) ? { uan } : {}),
        ...(bankAccountNumber && /^\d{9,18}$/.test(bankAccountNumber) ? { bankAccountNumber } : {}),
        ...(bankIfsc && IFSC_PATTERN.test(bankIfsc) ? { bankIfsc } : {}),
      },
    });
  });

  resolveManagers(rows, managerCells, existing);
  return { rows, unmatched, fileError: null };
}

/**
 * Turn each Reporting Manager cell into a person, from the file first and the
 * directory second — by email, then employee code, then full name.
 *
 * A name two people share is not guessed at, and neither is one that matches
 * nobody: the row is still imported, with a note, and the manager is set from
 * the profile. Nobody may report to themselves.
 */
function resolveManagers(
  rows: EmployeeImportRow[],
  managerCells: Map<number, string>,
  existing: ExistingPerson[],
): void {
  type Candidate = ManagerReference;
  const index = new Map<string, Candidate[]>();
  const add = (key: string, candidate: Candidate) => {
    if (!key) return;
    const list = index.get(key) ?? [];
    list.push(candidate);
    index.set(key, list);
  };
  for (const row of rows) {
    const ref: Candidate = { kind: 'file', line: row.line };
    add(`email:${row.employee.email}`, ref);
    add(`code:${squashCode(row.employee.employeeCode)}`, ref);
    add(`name:${normalName([row.employee.firstName, row.employee.lastName].filter(Boolean).join(' '))}`, ref);
  }
  for (const person of existing) {
    if (!person.id) continue;
    const ref: Candidate = { kind: 'directory', id: person.id };
    add(`email:${person.email?.trim().toLowerCase() ?? ''}`, ref);
    add(`code:${squashCode(person.employeeCode ?? '')}`, ref);
    add(`name:${normalName(person.fullName ?? '')}`, ref);
  }

  for (const row of rows) {
    const raw = managerCells.get(row.line);
    if (!raw) continue;
    const keys = [`email:${raw.toLowerCase()}`, `code:${squashCode(raw)}`, `name:${normalName(raw)}`];
    let found: Candidate[] | undefined;
    for (const key of keys) {
      const hits = index.get(key);
      if (hits && hits.length > 0) { found = hits; break; }
    }
    if (!found) {
      row.notes.push(`Reporting manager "${raw}" is not among the people being added or in your directory — set it on their profile.`);
    } else if (found.length > 1) {
      row.notes.push(`Reporting manager "${raw}" matches more than one person — set it on their profile.`);
    } else if (found[0].kind === 'file' && found[0].line === row.line) {
      row.notes.push('Listed as their own reporting manager — left blank.');
    } else {
      row.manager = found[0];
    }
  }
}
