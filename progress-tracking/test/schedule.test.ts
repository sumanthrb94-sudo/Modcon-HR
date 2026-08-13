// Unit tests for the scheduling logic.
// Run: node --experimental-strip-types --test test/schedule.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPrompt,
  canSendNow,
  isQuietHour,
  isWeekend,
  localHour,
  nextChannel,
  requiresConsent,
} from "../supabase/functions/_shared/schedule.ts";
import type { ProgressSource } from "../supabase/functions/_shared/types.ts";

const IST = { quiet_start: 19, quiet_end: 9, timezone: "Asia/Kolkata" };

// 2026-08-12 is a Wednesday.
const WED_1130_IST = new Date("2026-08-12T06:00:00Z"); // 11:30 local
const WED_2330_IST = new Date("2026-08-12T18:00:00Z"); // 23:30 local
const WED_0700_IST = new Date("2026-08-12T01:30:00Z"); // 07:00 local
const FRI_2330_UTC = new Date("2026-08-14T19:00:00Z"); // Saturday 00:30 local

test("local hour is read in the employee's zone, not the server's", () => {
  assert.equal(localHour(WED_1130_IST, "Asia/Kolkata"), 11);
  assert.equal(localHour(WED_1130_IST, "UTC"), 6);
  assert.equal(localHour(WED_1130_IST, "America/New_York"), 2);
});

test("an unknown timezone falls back to UTC instead of throwing", () => {
  assert.equal(localHour(WED_1130_IST, "Mars/Olympus_Mons"), 6);
});

test("quiet hours wrap midnight", () => {
  assert.equal(isQuietHour(WED_2330_IST, IST), true, "23:30 should be quiet");
  assert.equal(isQuietHour(WED_0700_IST, IST), true, "07:00 should be quiet");
  assert.equal(isQuietHour(WED_1130_IST, IST), false, "11:30 should be fine");
});

test("quiet window boundaries are start-inclusive and end-exclusive", () => {
  const at19 = new Date("2026-08-12T13:30:00Z"); // 19:00 local
  const at9 = new Date("2026-08-12T03:30:00Z");  // 09:00 local
  assert.equal(isQuietHour(at19, IST), true);
  assert.equal(isQuietHour(at9, IST), false);
});

test("a non-wrapping quiet window is taken literally", () => {
  const officeHours = { quiet_start: 9, quiet_end: 17, timezone: "Asia/Kolkata" };
  assert.equal(isQuietHour(WED_1130_IST, officeHours), true);
  assert.equal(isQuietHour(WED_2330_IST, officeHours), false);
});

test("start equal to end means no quiet period", () => {
  assert.equal(isQuietHour(WED_2330_IST, { quiet_start: 0, quiet_end: 0, timezone: "Asia/Kolkata" }), false);
});

test("weekend is judged in local time, not UTC", () => {
  assert.equal(isWeekend(WED_1130_IST, "Asia/Kolkata"), false);
  // Still Friday evening in UTC, already Saturday in Kolkata.
  assert.equal(isWeekend(FRI_2330_UTC, "UTC"), false);
  assert.equal(isWeekend(FRI_2330_UTC, "Asia/Kolkata"), true);
});

test("canSendNow explains why it said no", () => {
  assert.deepEqual(canSendNow(WED_1130_IST, IST), { ok: true });

  const quiet = canSendNow(WED_2330_IST, IST);
  assert.equal(quiet.ok, false);
  assert.match(quiet.reason!, /quiet hours/);

  const weekend = canSendNow(new Date("2026-08-15T06:00:00Z"), IST);
  assert.equal(weekend.ok, false);
  assert.equal(weekend.reason, "weekend");
});

test("weekend skipping can be turned off", () => {
  const sat = new Date("2026-08-15T06:00:00Z");
  assert.equal(canSendNow(sat, IST, { skipWeekends: false }).ok, true);
});

test("escalation walks the ladder and stops at the bottom", () => {
  const ladder: ProgressSource[] = ["app", "chat", "email"];
  assert.equal(nextChannel(ladder, "app"), "chat");
  assert.equal(nextChannel(ladder, "chat"), "email");
  assert.equal(nextChannel(ladder, "email"), null);
});

test("a channel not on the ladder does not escalate", () => {
  assert.equal(nextChannel(["app", "chat"], "call"), null);
});

test("only voice requires consent", () => {
  assert.equal(requiresConsent("call"), true);
  for (const c of ["app", "chat", "email"] as ProgressSource[]) {
    assert.equal(requiresConsent(c), false);
  }
});

test("the prompt always asks the same three questions", () => {
  const p = buildPrompt("Ship onboarding", 55, 9, "chat");
  assert.match(p.body, /What moved since last time/);
  assert.match(p.body, /as a %/);
  assert.match(p.body, /blocking you/);
  assert.match(p.body, /55%/);
  assert.match(p.body, /9 days ago/);
});

test("the prompt handles a goal with no number yet", () => {
  const p = buildPrompt("New goal", null, 9999, "email");
  assert.match(p.body, /don't have a number on file/);
  assert.match(p.body, /no updates yet/);
  assert.ok(!p.body.includes("9999"));
});

test("day count is singular at one day", () => {
  assert.match(buildPrompt("G", 10, 1, "chat").body, /1 day ago/);
  assert.ok(!buildPrompt("G", 10, 1, "chat").body.includes("1 days"));
});

test("the voice prompt is speakable — no markdown, no symbols", () => {
  const p = buildPrompt("Ship onboarding", 55, 9, "call");
  assert.ok(!p.body.includes("*"));
  assert.ok(!p.body.includes("%"));
  assert.ok(!p.body.includes("\n"));
  assert.match(p.body, /55 percent/);
});
