/**
 * The letters a small company's HR writes most: appointment, confirmation,
 * relieving and experience. There were none — only onboarding task titles
 * naming them — so every one was typed in Word from the employee record.
 *
 * Drafts from the record, not documents of record: each ends with a line for
 * the signatory, and Settings has nowhere to keep a letterhead, so HR prints
 * these onto their own or edits the text first. What is in them comes from the
 * record and nothing is invented; a field the record lacks is left as a blank
 * to fill rather than guessed.
 *
 * Pure, imports types only, unit-tested (tests/unit/hrLetters.test.ts).
 */
import type { Employee } from '@/types';

export type LetterKind = 'appointment' | 'confirmation' | 'relieving' | 'experience';

export const LETTER_KINDS: { kind: LetterKind; label: string }[] = [
  { kind: 'appointment', label: 'Appointment letter' },
  { kind: 'confirmation', label: 'Confirmation letter' },
  { kind: 'relieving', label: 'Relieving letter' },
  { kind: 'experience', label: 'Experience certificate' },
];

export interface Letter {
  readonly title: string;
  readonly paragraphs: string[];
  /** Why this letter cannot be written from the record yet, if it cannot. */
  readonly missing: string[];
}

const BLANK = '__________';

function longDate(iso: string | undefined): string {
  if (!iso) return BLANK;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return BLANK;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function rupees(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
}

export function buildLetter(
  kind: LetterKind,
  employee: Pick<Employee, 'fullName' | 'employeeCode' | 'designation' | 'department' | 'location' | 'dateOfJoining' | 'ctc' | 'confirmedOn' | 'lastWorkingDay' | 'probationMonths'>,
  company: { name: string },
  today: string,
): Letter {
  const org = company.name || BLANK;
  const name = employee.fullName;
  const missing: string[] = [];
  const header = [`Date: ${longDate(today)}`, `To: ${name} (${employee.employeeCode})`];
  switch (kind) {
    case 'appointment':
      if (!employee.dateOfJoining) missing.push('date of joining');
      return {
        title: 'Letter of appointment',
        missing,
        paragraphs: [
          ...header,
          `Dear ${name},`,
          `We are pleased to appoint you as ${employee.designation} in ${employee.department} at ${org}, based at ${employee.location}, with effect from ${longDate(employee.dateOfJoining)}.`,
          `Your annual cost to company will be ${employee.ctc > 0 ? rupees(employee.ctc) : BLANK}, paid monthly as set out in your salary structure. You will be on probation for ${employee.probationMonths ?? 6} months from your date of joining, after which your employment will be confirmed in writing.`,
          'Your employment is governed by the policies of the company as they stand from time to time, including those on leave, attendance and conduct.',
          'Please sign and return a copy of this letter to confirm your acceptance.',
          `For ${org}`,
          `Authorised signatory: ${BLANK}`,
        ],
      };
    case 'confirmation':
      if (!employee.confirmedOn) missing.push('confirmation date — confirm employment on the Compensation tab first');
      return {
        title: 'Confirmation of employment',
        missing,
        paragraphs: [
          ...header,
          `Dear ${name},`,
          `We are pleased to confirm your employment as ${employee.designation} at ${org} with effect from ${longDate(employee.confirmedOn)}, on completion of your probation.`,
          'All other terms of your appointment remain unchanged.',
          `For ${org}`,
          `Authorised signatory: ${BLANK}`,
        ],
      };
    case 'relieving':
      if (!employee.lastWorkingDay) missing.push('last working day — record the exit on the Compensation tab first');
      return {
        title: 'Relieving letter',
        missing,
        paragraphs: [
          ...header,
          `Dear ${name},`,
          `This is to confirm that you have been relieved of your duties as ${employee.designation} at ${org} at the close of business on ${longDate(employee.lastWorkingDay)}.`,
          'Your full and final settlement is processed separately. We thank you for your contribution and wish you well.',
          `For ${org}`,
          `Authorised signatory: ${BLANK}`,
        ],
      };
    case 'experience':
      if (!employee.dateOfJoining) missing.push('date of joining');
      return {
        title: 'Experience certificate',
        missing,
        paragraphs: [
          `Date: ${longDate(today)}`,
          'To whom it may concern',
          `This is to certify that ${name} (${employee.employeeCode}) was employed with ${org} from ${longDate(employee.dateOfJoining)} to ${employee.lastWorkingDay ? longDate(employee.lastWorkingDay) : 'date'}, last as ${employee.designation} in ${employee.department}.`,
          `For ${org}`,
          `Authorised signatory: ${BLANK}`,
        ],
      };
  }
}
