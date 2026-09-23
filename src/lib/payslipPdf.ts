/**
 * The payslip PDF — one definition, for the employee's Finance page and for
 * HR's Payroll page, so the document an employee downloads and the one HR
 * hands them are the same document.
 *
 * Built from the STORED payslip, which is the record of what was paid;
 * `storedDeductionRows` labels every deduction head so the lines add up to
 * the total printed under them.
 *
 * Amounts are printed as "Rs." and never with the rupee sign. jsPDF's built-in
 * fonts are WinAnsi and have no glyph for U+20B9: every amount printed as a
 * stray "¹", and jsPDF's fallback for the unknown character spread the whole
 * line out letter by letter. That was on every payslip in production until a
 * sample generated for QA Zero Org showed it.
 */
import type { Employee, Payslip } from '@/types';
import { storedDeductionRows } from '@/data/payroll';
import { formatDate } from '@/lib/utils';

function monthLong(month: string): string {
  const [year, mon] = month.split('-');
  return new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** An amount the built-in PDF fonts can draw: "Rs. 1,23,456" (negatives as "- Rs. 200"). */
export function pdfAmount(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toLocaleString('en-IN');
  return `${rounded < 0 ? '- ' : ''}Rs. ${digits}`;
}

/** Anything else that might carry a character outside WinAnsi, made safe. */
function pdfText(text: string): string {
  return text.replace(/₹\s?/g, 'Rs. ').replace(/[−–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

export async function downloadPayslipPdf(
  payslip: Payslip,
  employee: Employee,
  companyName?: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 14;
  const right = 196;
  const width = right - left;
  let y = 16;

  const text = (value: string, x: number, at: number, options: { bold?: boolean; size?: number; align?: 'left' | 'right'; color?: [number, number, number] } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.size ?? 9.5);
    doc.setTextColor(...(options.color ?? [32, 30, 29]));
    doc.text(pdfText(value), x, at, { align: options.align ?? 'left' });
  };
  const rule = (at: number, weight = 0.3) => {
    doc.setDrawColor(32, 30, 29);
    doc.setLineWidth(weight);
    doc.line(left, at, right, at);
  };

  // Header: the organisation, what this is, and for which month.
  text(companyName || 'Payslip', left, y, { bold: true, size: 16 });
  text(`Payslip for ${monthLong(payslip.month)}`, right, y, { bold: true, size: 11, align: 'right' });
  y += 3;
  rule(y, 0.8);
  y += 8;

  // Employee details, two columns.
  const details: Array<[string, string]> = [
    ['Employee name', employee.fullName],
    ['Employee code', employee.employeeCode],
    ['Designation', employee.designation],
    ['Department', employee.department],
    ['Location', employee.location],
    ['Employment type', employee.employmentType],
    ['Date of joining', employee.dateOfJoining ? formatDate(employee.dateOfJoining) : '—'],
    ['Pay period', monthLong(payslip.month)],
  ];
  const half = Math.ceil(details.length / 2);
  details.forEach(([label, value], i) => {
    const column = i < half ? left : left + width / 2;
    const row = y + (i % half) * 6;
    text(label, column, row, { color: [110, 104, 100] });
    text(value || '—', column + 32, row, { bold: true });
  });
  y += half * 6 + 4;

  // Earnings and deductions, side by side, each with its total.
  const colWidth = width / 2 - 4;
  const earnLeft = left;
  const dedLeft = left + width / 2 + 4;
  const splitConfigured =
    payslip.basic + payslip.hra + (payslip.medicalAllowance ?? 0) + (payslip.conveyanceAllowance ?? 0) + payslip.specialAllowance > 0;
  const earnings: Array<[string, number]> = splitConfigured
    ? [
      ['Basic salary', payslip.basic],
      ['House rent allowance', payslip.hra],
      ['Medical allowance', payslip.medicalAllowance ?? 0],
      ['Conveyance allowance', payslip.conveyanceAllowance ?? 0],
      ['Special allowance', payslip.specialAllowance],
      ...(payslip.bonus ? [['Bonus', payslip.bonus] as [string, number]] : []),
    ]
    : [['Gross salary (no salary structure set)', payslip.grossEarnings]];
  const deductions = storedDeductionRows(payslip);

  const header = (label: string, x: number) => {
    doc.setFillColor(243, 242, 242);
    doc.rect(x, y - 4.5, colWidth, 7, 'F');
    text(label, x + 2, y, { bold: true });
    text('Amount', x + colWidth - 2, y, { bold: true, align: 'right' });
  };
  header('Earnings', earnLeft);
  header('Deductions', dedLeft);
  let earnY = y + 7;
  let dedY = y + 7;
  for (const [label, value] of earnings) {
    text(label, earnLeft + 2, earnY);
    text(pdfAmount(value), earnLeft + colWidth - 2, earnY, { align: 'right' });
    earnY += 6;
  }
  for (const row of deductions) {
    text(row.label, dedLeft + 2, dedY);
    text(pdfAmount(row.value), dedLeft + colWidth - 2, dedY, { align: 'right' });
    if (row.hint) {
      dedY += 4.5;
      text(row.hint, dedLeft + 2, dedY, { size: 7.5, color: [110, 104, 100] });
    }
    dedY += 6;
  }
  y = Math.max(earnY, dedY) + 1;
  rule(y - 4);
  text('Gross earnings', earnLeft + 2, y, { bold: true });
  text(pdfAmount(payslip.grossEarnings), earnLeft + colWidth - 2, y, { bold: true, align: 'right' });
  text('Total deductions', dedLeft + 2, y, { bold: true });
  text(pdfAmount(payslip.totalDeductions), dedLeft + colWidth - 2, y, { bold: true, align: 'right' });
  y += 10;

  // Net pay, the figure the payslip exists to state.
  doc.setFillColor(32, 30, 29);
  doc.rect(left, y - 6, width, 11, 'F');
  text('Net pay (take home)', left + 3, y + 1, { bold: true, size: 11, color: [255, 255, 255] });
  text(pdfAmount(payslip.netPay), right - 3, y + 1, { bold: true, size: 12, align: 'right', color: [255, 255, 255] });
  y += 14;

  text(`Annual CTC: ${pdfAmount(employee.ctc)}    Monthly CTC: ${pdfAmount(Math.round(employee.ctc / 12))}    Status: ${payslip.status}`, left, y, { size: 8.5, color: [110, 104, 100] });
  y += 5;
  text('Loss of pay = gross earnings / calendar days in the month x days of unpaid absence.', left, y, { size: 8, color: [110, 104, 100] });
  y += 5;
  text('This is a computer-generated payslip and does not need a signature.', left, y, { size: 8, color: [110, 104, 100] });

  doc.save(`payslip-${employee.employeeCode}-${payslip.month}.pdf`);
}
