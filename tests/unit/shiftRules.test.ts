// Unit tests for the pure shift arithmetic in src/data/shiftRules.ts.
//
// Run: npm run test:unit
//
// The module under test imports nothing, deliberately: node's strip-types
// runner resolves neither the `@/*` alias nor firebase, so anything reaching
// for storage cannot be unit tested here. Storage wiring lives in
// src/data/shifts.ts and is covered by tests/e2e/shift-timings.spec.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clockMinutes,
  isLateForShift,
  resolveShift,
  shiftCaption,
  type EmployeeShift,
  type Shift,
  type ShiftConfig,
} from '../../src/data/shiftRules.ts';

const GENERAL: Shift = { id: 'general', name: 'General', start: '09:00', end: '18:00', graceMinutes: 15 };
const NIGHT: Shift = { id: 'night', name: 'Night', start: '22:00', end: '06:00', graceMinutes: 15 };

const CONFIG: ShiftConfig = { shifts: [GENERAL, NIGHT], defaultShiftId: 'general' };

// ---- clockMinutes ---------------------------------------------------------
// Moved here from attendance.ts so the parsing has one definition and that
// definition is testable. The behaviour below is the behaviour it already had.

test('clockMinutes reads a padded clock time as minutes past midnight', () => {
  assert.equal(clockMinutes('09:15'), 555);
  assert.equal(clockMinutes('00:00'), 0);
  assert.equal(clockMinutes('23:59'), 1439);
});

test('clockMinutes reads an unpadded hour', () => {
  // The reason comparison is done in minutes and never on the strings:
  // '9:05' > '09:15' is true lexicographically.
  assert.equal(clockMinutes('9:05'), 545);
});

test('clockMinutes refuses a time that is not a time', () => {
  assert.equal(clockMinutes('25:00'), null);
  assert.equal(clockMinutes('09:60'), null);
  assert.equal(clockMinutes('lunchtime'), null);
  assert.equal(clockMinutes(''), null);
  assert.equal(clockMinutes(null), null);
  assert.equal(clockMinutes(undefined), null);
});

// ---- isLateForShift, ordinary shift ---------------------------------------

test('an arrival within the grace period is not late', () => {
  assert.equal(isLateForShift(GENERAL, '08:55'), false);
  assert.equal(isLateForShift(GENERAL, '09:00'), false);
  assert.equal(isLateForShift(GENERAL, '09:14'), false);
});

test('the grace period is inclusive — arriving exactly on it is not late', () => {
  assert.equal(isLateForShift(GENERAL, '09:15'), false);
});

test('an arrival past the grace period is late', () => {
  assert.equal(isLateForShift(GENERAL, '09:16'), true);
  assert.equal(isLateForShift(GENERAL, '11:30'), true);
});

test('an unreadable arrival time is not late', () => {
  // Flagging someone on the strength of a value we could not read would be an
  // assertion about a day we know nothing about.
  assert.equal(isLateForShift(GENERAL, 'whenever'), false);
});

test('nobody is late when their organisation has declared no shift', () => {
  assert.equal(isLateForShift(null, '11:30'), false);
});

// ---- isLateForShift, a shift that crosses midnight ------------------------

test('a night shift judges an evening arrival against its own start', () => {
  assert.equal(isLateForShift(NIGHT, '21:50'), false);
  assert.equal(isLateForShift(NIGHT, '22:00'), false);
  assert.equal(isLateForShift(NIGHT, '22:15'), false);
  assert.equal(isLateForShift(NIGHT, '22:20'), true);
});

test('a night shift catches an arrival after midnight', () => {
  // The defect this exists to prevent: 00:30 is 30 minutes past midnight and
  // the threshold is 1335, so a naive comparison reports "not late" for
  // somebody two and a half hours into their shift.
  assert.equal(isLateForShift(NIGHT, '00:30'), true);
  assert.equal(isLateForShift(NIGHT, '05:30'), true);
});

test('an arrival outside a night shift altogether is not late', () => {
  // 07:00 is after the shift ended and long before the next one starts. It is
  // not an arrival this shift can judge, so it is not called late.
  assert.equal(isLateForShift(NIGHT, '07:00'), false);
  assert.equal(isLateForShift(NIGHT, '14:00'), false);
});

// ---- shiftCaption ---------------------------------------------------------

test('the caption reproduces the label attendance records already carry', () => {
  // Byte for byte what DEFAULT_SHIFT was, en dash included, so no seed record
  // changes its caption.
  assert.equal(shiftCaption(GENERAL), 'General (09:00 – 18:00)');
  assert.equal(shiftCaption(NIGHT), 'Night (22:00 – 06:00)');
});

test('an organisation with no shift captions nothing', () => {
  assert.equal(shiftCaption(null), '');
});

// ---- resolveShift ---------------------------------------------------------

test('an assigned employee is on their own shift', () => {
  assert.deepEqual(resolveShift(CONFIG, { 'emp-071': 'night' }, 'emp-071'), NIGHT);
});

test('an unassigned employee is on the organisation default', () => {
  assert.deepEqual(resolveShift(CONFIG, { 'emp-071': 'night' }, 'emp-003'), GENERAL);
});

test('asking without naming anybody gives the organisation default', () => {
  assert.deepEqual(resolveShift(CONFIG, {}, undefined), GENERAL);
});

test('an organisation that has declared no shifts resolves to nothing', () => {
  const empty: ShiftConfig = { shifts: [], defaultShiftId: null };
  assert.equal(resolveShift(empty, {}, 'emp-003'), null);
});

test('a shift list with no default resolves an unassigned employee to nothing', () => {
  const noDefault: ShiftConfig = { shifts: [GENERAL], defaultShiftId: null };
  assert.equal(resolveShift(noDefault, {}, 'emp-003'), null);
});

test('an assignment naming a shift that no longer exists falls back to the default', () => {
  // Withdrawing a shift requires it to be empty, so this should not arise —
  // but a stale id must not resolve to nothing and silently stop judging
  // somebody's arrivals.
  assert.deepEqual(resolveShift(CONFIG, { 'emp-071': 'retired-shift' }, 'emp-071'), GENERAL);
});

// ---- Hours belonging to one person ----------------------------------------
// The organisation's list says what the company runs. Somebody negotiated to
// start at 10:00 is not a shift the company runs, and declaring one for them
// would offer their hours to everybody in Settings.

const OWN_HOURS: EmployeeShift = { start: '10:00', end: '19:00', graceMinutes: 5 };

test('hours of their own outrank the organisation default', () => {
  const shift = resolveShift(CONFIG, {}, 'emp-071', { 'emp-071': OWN_HOURS });
  assert.equal(shift?.start, '10:00');
  assert.equal(shift?.end, '19:00');
  assert.equal(shift?.graceMinutes, 5);
});

test('hours of their own outrank a shift they are assigned', () => {
  // The two stores must never disagree about one person. The UI makes them one
  // control, but resolution states the order regardless.
  const shift = resolveShift(CONFIG, { 'emp-071': 'night' }, 'emp-071', { 'emp-071': OWN_HOURS });
  assert.equal(shift?.start, '10:00');
});

test('somebody else is untouched by one person\'s own hours', () => {
  assert.deepEqual(resolveShift(CONFIG, {}, 'emp-003', { 'emp-071': OWN_HOURS }), GENERAL);
});

test('their own hours carry their own grace period', () => {
  const shift = resolveShift(CONFIG, {}, 'emp-071', { 'emp-071': OWN_HOURS });
  // 10:05 is exactly the grace; 10:06 is past it. The organisation's 15
  // minutes has nothing to do with it.
  assert.equal(isLateForShift(shift, '10:05'), false);
  assert.equal(isLateForShift(shift, '10:06'), true);
});

test('their own hours can cross midnight like any other', () => {
  const shift = resolveShift(CONFIG, {}, 'emp-071', {
    'emp-071': { start: '23:00', end: '07:00', graceMinutes: 10 },
  });
  assert.equal(isLateForShift(shift, '23:05'), false);
  assert.equal(isLateForShift(shift, '01:15'), true);
});

test('their own hours are captioned as their own', () => {
  const shift = resolveShift(CONFIG, {}, 'emp-071', { 'emp-071': OWN_HOURS });
  assert.equal(shiftCaption(shift), 'Custom (10:00 – 19:00)');
});

test('an unusable entry of their own is ignored rather than obeyed', () => {
  // A half-written override must not resolve to hours nobody typed. Falling
  // back to the organisation's is the only honest reading.
  const shift = resolveShift(CONFIG, {}, 'emp-071', {
    'emp-071': { start: '', end: '19:00', graceMinutes: 5 } as EmployeeShift,
  });
  assert.deepEqual(shift, GENERAL);
});
