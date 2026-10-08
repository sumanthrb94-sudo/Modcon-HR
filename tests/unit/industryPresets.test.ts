import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRY_PRESETS, findIndustryPreset } from '../../src/data/industryPresets.ts';
import { LEAVE_POLICY_TEMPLATES } from '../../src/data/leavePolicyTemplates.ts';

test('every preset points at a leave template that exists', () => {
  const ids = new Set(LEAVE_POLICY_TEMPLATES.map((template) => template.id));
  for (const preset of INDUSTRY_PRESETS) assert.ok(ids.has(preset.leaveTemplateId), preset.id);
});

test('preset ids are unique and findable by id or by the label stored on the profile', () => {
  assert.equal(new Set(INDUSTRY_PRESETS.map((preset) => preset.id)).size, INDUSTRY_PRESETS.length);
  assert.equal(findIndustryPreset('real-estate')?.label, 'Real estate & sales');
  assert.equal(findIndustryPreset('Real estate & sales')?.id, 'real-estate');
  assert.equal(findIndustryPreset('SaaS / HR Tech'), undefined);
  assert.equal(findIndustryPreset(''), undefined);
});

test('real estate works weekends, so its day off is a weekday', () => {
  const preset = findIndustryPreset('real-estate');
  assert.ok(preset);
  assert.notEqual(preset.weekOff, 'Sunday');
  assert.notEqual(preset.weekOff, 'Saturday');
  assert.equal(preset.saturdays, 'worked');
});
