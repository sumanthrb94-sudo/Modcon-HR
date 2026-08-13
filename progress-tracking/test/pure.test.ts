// Unit tests for the pure decision + parsing logic.
// Run: node --experimental-strip-types --test test/pure.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { gate } from "../supabase/functions/_shared/gate.ts";
import { extractGoalId, isUuid, parseSlashCommand, stripQuotedReply } from "../supabase/functions/_shared/parse.ts";
import type { Extraction, GoalCandidate } from "../supabase/functions/_shared/types.ts";

const GOAL_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GOAL_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function extraction(over: Partial<Extraction> = {}): Extraction {
  return {
    goal_ref: GOAL_A,
    percent: 60,
    status: "on_track",
    blockers: [],
    summary: "build started",
    confidence: 0.95,
    reasoning: "explicit number given",
    ...over,
  };
}

const oneGoal: GoalCandidate[] = [{ id: GOAL_A, title: "Ship onboarding", current_percent: 50 }];
const twoGoals: GoalCandidate[] = [
  ...oneGoal,
  { id: GOAL_B, title: "Reduce backlog", current_percent: 30 },
];

test("a clear numeric update on a named goal auto-applies", () => {
  const d = gate(extraction(), oneGoal, true);
  assert.equal(d.state, "applied");
  assert.equal(d.reason, null);
});

test("qualitative-only update never auto-applies", () => {
  const d = gate(extraction({ percent: null, confidence: 0.99 }), oneGoal, true);
  assert.equal(d.state, "needs_review");
  assert.ok(d.confidence <= 0.6);
  assert.match(d.reason!, /no explicit percentage/);
});

test("unresolved goal goes to review with zero confidence", () => {
  const d = gate(extraction({ goal_ref: null }), twoGoals, false);
  assert.equal(d.state, "needs_review");
  assert.equal(d.confidence, 0);
  assert.match(d.reason!, /which goal/);
});

test("no goals on file is reported differently from an ambiguous match", () => {
  const d = gate(extraction({ goal_ref: null }), [], false);
  assert.match(d.reason!, /No active goal on file/);
});

test("signal-free chatter is refused", () => {
  const d = gate(extraction({ percent: null, status: null, blockers: [] }), oneGoal, true);
  assert.equal(d.confidence, 0);
  assert.match(d.reason!, /No progress signal/);
});

test("a goal inferred among several is held back", () => {
  const d = gate(extraction(), twoGoals, false);
  assert.equal(d.state, "needs_review");
  assert.match(d.reason!, /inferred from 2 active goals/);
});

test("a sharp backwards jump is treated as a likely misparse", () => {
  const d = gate(extraction({ percent: 10 }), oneGoal, true);
  assert.equal(d.state, "needs_review");
  assert.ok(d.confidence <= 0.5);
  assert.match(d.reason!, /large drop from 50% to 10%/);
});

test("a small backwards correction is allowed through", () => {
  const d = gate(extraction({ percent: 45 }), oneGoal, true);
  assert.equal(d.state, "applied");
});

test("declaring a goal complete always needs sign-off", () => {
  for (const done of [extraction({ percent: 100 }), extraction({ status: "done", percent: 95 })]) {
    const d = gate(done, oneGoal, true);
    assert.equal(d.state, "needs_review", JSON.stringify(done));
    assert.match(d.reason!, /completion needs sign-off/);
  }
});

test("the auto-apply threshold is configurable", () => {
  const hedged = extraction({ confidence: 0.7 });
  assert.equal(gate(hedged, oneGoal, true).state, "needs_review");
  assert.equal(gate(hedged, oneGoal, true, 0.65).state, "applied");
});

test("blockers alone are enough signal to record", () => {
  const d = gate(
    extraction({ percent: null, status: null, blockers: ["vendor access"], confidence: 0.9 }),
    oneGoal,
    true,
  );
  assert.match(d.reason!, /no explicit percentage/);
  assert.equal(d.state, "needs_review");
});

// ---------------------------------------------------------------------------
// Slash command
// ---------------------------------------------------------------------------

test("slash command parses goal, percent and blocker", () => {
  const p = parseSlashCommand("GOAL-12 60% blocked on vendor sign-off")!;
  assert.equal(p.goalRef, "GOAL-12");
  assert.equal(p.percent, 60);
  assert.deepEqual(p.blockers, ["vendor sign-off"]);
});

test("slash command works without a goal ref or percent sign", () => {
  const p = parseSlashCommand("40")!;
  assert.equal(p.goalRef, null);
  assert.equal(p.percent, 40);
  assert.deepEqual(p.blockers, []);
});

test("slash command rejects nonsense and out-of-range values", () => {
  assert.equal(parseSlashCommand(""), null);
  assert.equal(parseSlashCommand("going well thanks"), null);
  assert.equal(parseSlashCommand("GOAL-12 420%"), null);
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

test("quoted reply history is stripped", () => {
  const body = [
    "Design is signed off, build starts Monday. I'd say 55%.",
    "",
    "On Tue, 12 Aug 2026 at 09:14, ModCon HR <goal+x@updates.example.com> wrote:",
    "> How is Ship onboarding revamp going?",
  ].join("\n");
  const cleaned = stripQuotedReply(body);
  assert.match(cleaned, /55%/);
  assert.ok(!cleaned.includes("How is Ship onboarding"));
});

test("outlook-style and mobile-signature replies are stripped", () => {
  assert.equal(stripQuotedReply("Still blocked.\n\nFrom: ModCon HR\nSent: Tuesday"), "Still blocked.");
  assert.equal(stripQuotedReply("70% done\n\nSent from my iPhone"), "70% done");
});

test("goal address is extracted from any recipient field", () => {
  assert.equal(extractGoalId("ModCon <goal+" + GOAL_A + "@updates.example.com>"), GOAL_A);
  assert.equal(extractGoalId("hr@example.com", `goal+${GOAL_B}@updates.example.com`), GOAL_B);
  assert.equal(extractGoalId("someone@example.com", undefined), undefined);
});

test("uuid guard rejects human goal refs", () => {
  assert.equal(isUuid(GOAL_A), true);
  assert.equal(isUuid("GOAL-12"), false);
  assert.equal(isUuid(undefined), false);
});
