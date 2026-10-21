import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLetter } from '../../src/data/hrLetters.ts';

const asha = {
  fullName: 'Asha Rao',
  employeeCode: 'MC-001',
  designation: 'Site Engineer',
  department: 'Projects',
  location: 'Pune',
  dateOfJoining: '2025-06-02',
  ctc: 600000,
};

test('an appointment letter is written from the record', () => {
  const l = buildLetter('appointment', asha, { name: 'Rao Builders' }, '2026-10-21');
  const text = l.paragraphs.join('\n');
  assert.match(text, /appoint you as Site Engineer in Projects at Rao Builders, based at Pune, with effect from 2 June 2025/);
  assert.match(text, /Rs\. 6,00,000/);
  assert.deepEqual(l.missing, []);
});

test('a letter that needs a date the record lacks says so instead of inventing one', () => {
  const l = buildLetter('relieving', asha, { name: 'Rao Builders' }, '2026-10-21');
  assert.equal(l.missing.length, 1);
  assert.match(l.paragraphs.join('\n'), /__________/);
});

test('an experience certificate runs to the last working day when there is one', () => {
  const l = buildLetter('experience', { ...asha, lastWorkingDay: '2026-09-30' }, { name: 'Rao Builders' }, '2026-10-21');
  assert.match(l.paragraphs.join('\n'), /from 2 June 2025 to 30 September 2026, last as Site Engineer/);
});
