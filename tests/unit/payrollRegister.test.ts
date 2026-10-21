import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payrollRegisterCsv } from '../../src/data/payrollRegister.ts';
import type { Payslip } from '../../src/types/index.ts';

const base: Payslip = {
  id: 'ps-e1-2026-09',
  employeeId: 'e1',
  month: '2026-09',
  basic: 25000,
  hra: 12500,
  medicalAllowance: 0,
  conveyanceAllowance: 0,
  specialAllowance: 12500,
  bonus: 0,
  pf: 1800,
  tax: 2000,
  otherDeductions: 1400,
  grossEarnings: 50000,
  totalDeductions: 5200,
  netPay: 44800,
  status: 'Paid',
};

const people: Record<string, { employeeCode: string; name: string; department: string }> = {
  e1: { employeeCode: 'EMP002', name: 'Asha Rao', department: 'Sales' },
  e2: { employeeCode: 'EMP001', name: '=HYPERLINK("x")', department: 'Ops, North' },
};

test('one row per payslip, sorted by code, with totals', () => {
  const second: Payslip = { ...base, id: 'ps-e2', employeeId: 'e2', netPay: 30000, grossEarnings: 32000, totalDeductions: 2000 };
  const out = payrollRegisterCsv([base, second], (id) => people[id]);
  const lines = out.csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith('EMP001,'));
  assert.equal(out.totals.net, 74800);
});

test('a formula-looking name is neutralised and a comma is quoted', () => {
  const out = payrollRegisterCsv([{ ...base, employeeId: 'e2' }], (id) => people[id]);
  const row = out.csv.trim().split('\n')[1];
  assert.ok(row.includes(`"'=HYPERLINK(""x"")"`), row);
  assert.ok(row.includes('"Ops, North"'), row);
});

test('ESI and PT are their own columns where the payslip recorded them, blank where it did not', () => {
  const recorded: Payslip = {
    ...base,
    statutoryPaid: { pfWages: 15000, epsWages: 15000, epf: 1800, eps: 1250, epfEpsDifference: 550, edli: 75, esiEmployee: 0, esiEmployer: 0, professionalTax: 200, ncpDays: 0 },
  };
  const header = payrollRegisterCsv([], () => undefined).csv.trim().split(',');
  const cols = payrollRegisterCsv([recorded], (id) => people[id]).csv.trim().split('\n')[1].split(',');
  assert.equal(cols[header.indexOf('professional_tax')], '200');
  assert.equal(cols[header.indexOf('other_deductions')], '1200');
  const legacy = payrollRegisterCsv([base], (id) => people[id]).csv.trim().split('\n')[1].split(',');
  assert.equal(legacy[header.indexOf('professional_tax')], '');
  assert.equal(legacy[header.indexOf('other_deductions')], '1400');
});
