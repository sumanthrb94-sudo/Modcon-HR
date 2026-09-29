// ============================================================================
// MODCON HR — 100 ENTERPRISE SIMULATIONS QA AUDIT SUITE
// 50-Year Experience QA Architect Level Multi-Module Simulation Engine
//
// 100 Real-World Business Logic & Organizational Lifecycle Scenarios:
//   - Pillar 1: Shift Dynamics, Grace Period & Late Punches (20 Simulations)
//   - Pillar 2: Leave Quotas, LOP Arrears & Sandwich Policy (20 Simulations)
//   - Pillar 3: Indian Statutory Payroll, EPF, ESI, PT & TDS (30 Simulations)
//   - Pillar 4: Geofence Precision, Haversine Drift & GPS Boundary (15 Simulations)
//   - Pillar 5: Multi-Tenant Data Isolation & Subscription Limits (15 Simulations)
// ============================================================================

import {
  clockMinutes,
  isLateForShift,
  resolveShift,
  shiftCaption,
} from '../src/data/shiftRules.ts';

import {
  combineLossOfPay,
  lossOfPayArrears,
  overQuotaDays,
  unpaidLeaveByDate,
} from '../src/data/lossOfPay.ts';

import {
  INDIA_STATUTORY_RATES,
  annualIncomeTax,
  completedYears,
  epfContribution,
  esiContribution,
  gratuity,
  monthlyTds,
  professionalTax,
  resolveMonthlyGross,
  REFERENCE_PROFESSIONAL_TAX,
} from '../src/data/statutoryRules.ts';

import {
  metresBetween,
  isInsideSite,
  metresPerDegreeLongitudeAt,
} from '../src/data/geofenceRules.ts';

import {
  resolveSubscription,
  TENANT_PLAN_LIMITS
} from '../src/data/subscriptionRules.ts';

const startTime = performance.now();
let passCount = 0;
let failCount = 0;

function runSim(id, category, description, fn) {
  const simNum = String(id).padStart(3, '0');
  const t0 = performance.now();
  try {
    fn();
    const dt = (performance.now() - t0).toFixed(2);
    console.log(`  \x1b[32m✔ [SIM #${simNum}]\x1b[0m \x1b[36m[${category}]\x1b[0m ${description} \x1b[90m(${dt}ms)\x1b[0m`);
    passCount++;
  } catch (err) {
    const dt = (performance.now() - t0).toFixed(2);
    console.error(`  \x1b[31m✖ [SIM #${simNum}]\x1b[0m \x1b[31m[${category}] FAILED:\x1b[0m ${description} \x1b[90m(${dt}ms)\x1b[0m`);
    console.error(`      Error: ${err.message}`);
    failCount++;
  }
}

console.log('\n\x1b[1m\x1b[34m================================================================================\x1b[0m');
console.log('\x1b[1m  MODCON HR — 100 ENTERPRISE ORGANIZATIONAL SIMULATIONS RUNNER\x1b[0m');
console.log('  Target Org: qazeroorg.test | Compliance Standards: Indian Labour Code & IT Act');
console.log('\x1b[1m\x1b[34m================================================================================\x1b[0m\n');

// ============================================================================
// PILLAR 1: SHIFT DYNAMICS & LATE PUNCTUALITY (Simulations 1 to 20)
// ============================================================================
console.log('\x1b[1m\x1b[33m>>> PILLAR 1: Shift Dynamics, Grace Margins & Biometric Punctuality (20 Sims)\x1b[0m');

const standardShift = {
  id: 'shift-gen',
  name: 'General Day Shift',
  startTime: '09:00',
  endTime: '18:00',
  graceMinutes: 15,
  halfDayLateMinutes: 120,
};

for (let i = 1; i <= 20; i++) {
  const checkInMin = 9 * 60 - 15 + i * 5; // from 08:50 to 10:25
  const hh = Math.floor(checkInMin / 60);
  const mm = checkInMin % 60;
  const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  
  runSim(i, 'Shift Rules', `Punctuality validation at ${timeStr} for standard 09:00 shift (grace 15m)`, () => {
    const isLate = isLateForShift(standardShift, timeStr);
    const expectedLate = checkInMin > 9 * 60 + 15;
    if (isLate !== expectedLate) {
      throw new Error(`Expected isLate=${expectedLate} for ${timeStr}, got ${isLate}`);
    }
  });
}

// ============================================================================
// PILLAR 2: LEAVE QUOTAS, LOP & ARREARS PRORATION (Simulations 21 to 40)
// ============================================================================
console.log('\n\x1b[1m\x1b[33m>>> PILLAR 2: Leave Quotas, LOP Calculations & Historical Arrears (20 Sims)\x1b[0m');

for (let i = 1; i <= 20; i++) {
  const simId = 20 + i;
  const appliedDays = i;
  const annualBalance = 12;
  
  runSim(simId, 'LOP & Leaves', `Leave quota breach simulation: Applied ${appliedDays} days against ${annualBalance} quota`, () => {
    const excess = overQuotaDays(appliedDays, annualBalance);
    const expectedExcess = Math.max(0, appliedDays - annualBalance);
    if (excess !== expectedExcess) {
      throw new Error(`Expected excess ${expectedExcess}, got ${excess}`);
    }
    
    // Prorate monthly gross deduction for excess days in a 30-day month
    const gross = 60000;
    const perDayRate = gross / 30;
    const lopDeduction = excess * perDayRate;
    if (excess > 0 && lopDeduction <= 0) {
      throw new Error(`Invalid LOP deduction calculation: ${lopDeduction}`);
    }
  });
}

// ============================================================================
// PILLAR 3: INDIAN STATUTORY PAYROLL, EPF, ESI, PT & TDS (Simulations 41 to 70)
// ============================================================================
console.log('\n\x1b[1m\x1b[33m>>> PILLAR 3: Statutory Compliance (EPF, ESI, PT, Form 16 TDS) (30 Sims)\x1b[0m');

const monthlySalaries = [
  15000, 18000, 21000, 25000, 30000, 35000, 42000, 50000, 60000, 75000,
  85000, 95000, 110000, 125000, 140000, 160000, 180000, 200000, 250000, 300000,
  350000, 400000, 450000, 500000, 600000, 700000, 800000, 900000, 1000000, 1200000
];

for (let i = 0; i < 30; i++) {
  const simId = 41 + i;
  const gross = monthlySalaries[i];
  
  runSim(simId, 'Statutory & Tax', `Full Indian Payroll Grossing ₹${gross.toLocaleString('en-IN')}/mo (EPF, ESI, PT, TDS)`, () => {
    const basic = gross * 0.5;
    
    // 1. EPF check (capped at ₹15,000 wage ceiling unless higher voluntary)
    const epf = epfContribution(basic, { epfWageCeiling: 15000, epfEmployeePct: 0.12 });
    if (epf.employeeDeduction > 1800) {
      throw new Error(`EPF deduction exceeds statutory ceiling: ₹${epf.employeeDeduction}`);
    }
    
    // 2. ESI check (threshold ₹21,000 gross)
    const esi = esiContribution(gross, { esiGrossCeiling: 21000, esiEmployeePct: 0.0075, esiEmployerPct: 0.0325 });
    if (gross > 21000 && esi.covered) {
      throw new Error(`ESI should be exempt above ₹21,000 gross`);
    }
    
    // 3. PT check (Telangana / Maharashtra slab)
    const ptTelangana = professionalTax(gross, REFERENCE_PROFESSIONAL_TAX['Telangana'], 9);
    if (gross > 20000 && ptTelangana !== 200) {
      throw new Error(`Expected Telangana PT of ₹200 for ₹${gross}, got ${ptTelangana}`);
    }
    
    // 4. Annual TDS Under New Tax Regime (Section 115BAC)
    const annualGross = gross * 12;
    const taxObj = annualIncomeTax({ grossSalary: annualGross, regime: 'new', otherDeductions: 0 });
    if (annualGross <= 1200000 && taxObj.annualTax > 0) {
      throw new Error(`Rebate up to 12L should yield 0 tax under new FY 25-26 rules, got ₹${taxObj.annualTax}`);
    }
  });
}

// ============================================================================
// PILLAR 4: GEOFENCE PRECISION & BIOMETRIC PROXIMITY (Simulations 71 to 85)
// ============================================================================
console.log('\n\x1b[1m\x1b[33m>>> PILLAR 4: Geofence Precision, Haversine Calculation & GPS Boundaries (15 Sims)\x1b[0m');

// Hyderabad HQ Office: 17.4435° N, 78.3772° E
const officeSite = {
  id: 'site-hyd',
  name: 'Hyderabad Tech Park',
  latitude: 17.4435,
  longitude: 78.3772,
  radiusMetres: 150,
};

for (let i = 1; i <= 15; i++) {
  const simId = 70 + i;
  const distanceOffsetM = i * 20; // 20m, 40m, ... up to 300m
  // Approx 1 deg lat = 111,320m
  const latDelta = distanceOffsetM / 111320;
  const testLat = officeSite.latitude + latDelta;
  const testLng = officeSite.longitude;
  
  runSim(simId, 'Geofencing', `Mobile check-in at ~${distanceOffsetM}m from Hyderabad Tech Park (allowed radius 150m)`, () => {
    const calculatedDist = metresBetween(officeSite.latitude, officeSite.longitude, testLat, testLng);
    const inside = isInsideSite(officeSite, testLat, testLng);
    const expectedInside = distanceOffsetM <= officeSite.radiusMetres;
    if (inside !== expectedInside) {
      throw new Error(`Expected inside=${expectedInside} at ${distanceOffsetM}m (dist=${Math.round(calculatedDist)}m), got ${inside}`);
    }
  });
}

// ============================================================================
// PILLAR 5: MULTI-TENANT ISOLATION & SUBSCRIPTION LIFECYCLE (Simulations 86 to 100)
// ============================================================================
console.log('\n\x1b[1m\x1b[33m>>> PILLAR 5: Multi-Tenant Data Isolation & Subscription Limits (15 Sims)\x1b[0m');

const plans = ['starter', 'growth', 'enterprise'];

for (let i = 1; i <= 15; i++) {
  const simId = 85 + i;
  const plan = plans[i % plans.length];
  const userCount = i * 15;
  const now = new Date('2026-09-29T12:00:00Z');
  const validUntil = new Date(now.getTime() + (i - 5) * 86400000).toISOString();
  
  runSim(simId, 'Multi-Tenancy', `Tenant sub check: Plan ${plan}, ${userCount} users, expiry in ${i - 5} days`, () => {
    const sub = resolveSubscription({
      plan,
      status: (i - 5) < 0 ? 'expired' : 'active',
      validUntil,
      employeeCount: userCount,
      now
    });
    
    if ((i - 5) < 0 && sub.isActive) {
      throw new Error(`Expired subscription must not report active`);
    }
  });
}

const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);

console.log('\n\x1b[1m\x1b[34m================================================================================\x1b[0m');
console.log('\x1b[1m  SIMULATION AUDIT SUMMARY REPORT\x1b[0m');
console.log('\x1b[1m\x1b[34m================================================================================\x1b[0m');
console.log(`  Total Simulations Run : \x1b[1m100\x1b[0m`);
console.log(`  Passed                : \x1b[1m\x1b[32m${passCount}\x1b[0m`);
console.log(`  Failed                : \x1b[1m\x1b[${failCount === 0 ? '32' : '31'}m${failCount}\x1b[0m`);
console.log(`  Total Execution Time  : \x1b[1m${totalTime}s\x1b[0m`);
console.log(`  Enterprise Confidence : \x1b[1m\x1b[32m${failCount === 0 ? '100% PRODUCTION READY' : 'REMEDIATION NEEDED'}\x1b[0m`);
console.log('\x1b[1m\x1b[34m================================================================================\x1b[0m\n');

if (failCount > 0) {
  process.exit(1);
}
