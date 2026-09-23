/**
 * The payslip PDF — one definition, for the employee's Finance page and for
 * HR's Payroll page, so the document an employee downloads and the one HR
 * hands them are the same document.
 *
 * Built from the STORED payslip, which is the record of what was paid;
 * `storedDeductionRows` labels every deduction head so the lines add up to
 * the total printed under them.
 */
import type { Employee, Payslip } from '@/types';
import { storedDeductionRows } from '@/data/payroll';
import { formatDate, formatINR } from '@/lib/utils';

function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  return new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export async function downloadPayslipPdf(
  payslip: Payslip,
  employeeRecord: Employee,
  companyName?: string,
): Promise<void> {
  // A payslip paid without a salary structure carries every component at zero;
  // printing a breakdown of zeroes would assert a split nobody defined.
  const splitConfigured =
    payslip.basic + payslip.hra + (payslip.medicalAllowance ?? 0) + (payslip.conveyanceAllowance ?? 0) + payslip.specialAllowance > 0;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const margin = 14;
  const lineHeight = 6;
  const maxWidth = 182;
  const pageHeight = 297;
  let y = margin;

  const writeLine = (text: string, options?: { bold?: boolean; size?: number }) => {
    const fontSize = options?.size ?? 10;
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);

    const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
    wrapped.forEach((line) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
  };

  writeLine(`${companyName ? `${companyName} - ` : ''}Payslip`, { bold: true, size: 15 });
  writeLine(`Month: ${monthLabel(payslip.month)}`, { bold: true, size: 11 });
  y += 2;

  writeLine('Employee Profile', { bold: true, size: 11 });
  writeLine(`Name: ${employeeRecord.fullName}`);
  writeLine(`Employee Code: ${employeeRecord.employeeCode}`);
  writeLine(`Designation: ${employeeRecord.designation}`);
  writeLine(`Department: ${employeeRecord.department}`);
  writeLine(`Location: ${employeeRecord.location}`);
  writeLine(`Employment Type: ${employeeRecord.employmentType}`);
  writeLine(`Date of Joining: ${formatDate(employeeRecord.dateOfJoining)}`);
  y += 2;

  writeLine('Salary Structure', { bold: true, size: 11 });
  if (splitConfigured) {
    writeLine(`Basic Salary: ${formatINR(payslip.basic)}`);
    writeLine(`House Rent Allowance: ${formatINR(payslip.hra)}`);
    // Nullish rather than truthy: a stored payslip from before these existed
    // has no field at all, and a legitimate zero must still print as ₹0.
    writeLine(`Medical Allowance: ${formatINR(payslip.medicalAllowance ?? 0)}`);
    writeLine(`Conveyance Allowance: ${formatINR(payslip.conveyanceAllowance ?? 0)}`);
    writeLine(`Special Allowance: ${formatINR(payslip.specialAllowance)}`);
    writeLine(`Bonus: ${formatINR(payslip.bonus)}`);
  } else {
    // A statement that prints a component breakdown the organisation never
    // defined would be a document asserting somebody else's policy.
    writeLine('No salary structure has been set for this organisation.');
  }
  writeLine(`Gross Earnings: ${formatINR(payslip.grossEarnings)}`, { bold: true });
  y += 2;

  writeLine('Deductions', { bold: true, size: 11 });
  // Every head the payslip withheld, labelled for what it holds — this
  // printed the whole `otherDeductions` bucket as "Loss of Pay" and left PF
  // and TDS off, so the lines did not add up to the total beneath them.
  for (const row of storedDeductionRows(payslip)) {
    writeLine(`${row.label}: ${formatINR(row.value)}${row.hint ? ` (${row.hint})` : ''}`);
  }
  writeLine(`Total Deductions: ${formatINR(payslip.totalDeductions)}`, { bold: true });
  writeLine('Loss of pay = gross earnings ÷ calendar days in the month × days of unpaid absence.', { size: 8 });
  y += 2;

  writeLine('Salary Information', { bold: true, size: 11 });
  writeLine(`Annual CTC: ${formatINR(employeeRecord.ctc)}`);
  writeLine(`Monthly CTC: ${formatINR(Math.round(employeeRecord.ctc / 12))}`);
  writeLine(`Payroll Status: ${payslip.status}`);
  writeLine(`Net Pay (Take Home): ${formatINR(payslip.netPay)}`, { bold: true, size: 11 });

  doc.save(`payslip-${employeeRecord.employeeCode}-${payslip.month}.pdf`);
}
