// Unit tests for what an organisation is allowed to save as its check-in policy.
//
// These are refusals more than acceptances, because the cost of a bad policy is
// not a bad request — it is a queue of check-ins the dispatcher can only fail,
// discovered an hour later by whoever reads the logs.
//
// Run: node --experimental-strip-types --test test/policy-input.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { validatePolicy } from "../supabase/functions/_shared/policyInput.ts";

const valid = {
  cadence_days: 7,
  channel_ladder: ["app", "chat", "email"],
  escalate_after_days: 2,
  quiet_start: 19,
  quiet_end: 9,
  timezone: "Asia/Kolkata",
};

const errorOf = (result: ReturnType<typeof validatePolicy>) =>
  result.ok ? "" : result.error;

test("accepts a well-formed policy", () => {
  const result = validatePolicy(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, valid);
});

test("refuses an empty channel ladder", () => {
  const result = validatePolicy({ ...valid, channel_ladder: [] });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /at least one channel/i);
});

test("refuses a channel that is not a known source", () => {
  const result = validatePolicy({ ...valid, channel_ladder: ["carrier-pigeon"] });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /carrier-pigeon/);
});

// 'system' is in the progress_source enum but nobody is ever asked on it.
test("refuses the system channel", () => {
  const result = validatePolicy({ ...valid, channel_ladder: ["system"] });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /system/);
});

test("refuses a duplicated channel", () => {
  const result = validatePolicy({ ...valid, channel_ladder: ["app", "app"] });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /once/i);
});

test("refuses a cadence of zero days", () => {
  const result = validatePolicy({ ...valid, cadence_days: 0 });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /cadence/i);
});

test("refuses a fractional cadence", () => {
  const result = validatePolicy({ ...valid, cadence_days: 1.5 });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /cadence/i);
});

test("refuses quiet hours outside the clock", () => {
  const result = validatePolicy({ ...valid, quiet_start: 25 });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /quiet_start/i);
});

test("accepts midnight as a quiet hour", () => {
  assert.equal(validatePolicy({ ...valid, quiet_start: 0, quiet_end: 0 }).ok, true);
});

test("refuses an unrecognised timezone", () => {
  const result = validatePolicy({ ...valid, timezone: "Mars/Olympus_Mons" });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /timezone/i);
});

test("refuses an escalation threshold of zero days", () => {
  const result = validatePolicy({ ...valid, escalate_after_days: 0 });
  assert.equal(result.ok, false);
  assert.match(errorOf(result), /escalation/i);
});

test("refuses a policy that is not an object at all", () => {
  assert.equal(validatePolicy(null).ok, false);
  assert.equal(validatePolicy("weekly").ok, false);
});

test("keeps only the fields it validated", () => {
  const result = validatePolicy({ ...valid, org_id: "somebody-elses-organisation" });
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.ok ? result.value : {}, "org_id"), false);
});
