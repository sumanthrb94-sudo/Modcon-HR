// Deterministic guardrails on top of the model's self-reported confidence.
// Pure — no Deno, no network — so it can be unit tested directly.

import type { Extraction, GoalCandidate, ProgressState } from "./types.ts";

export interface Decision {
  state: ProgressState;
  confidence: number;
  reason: string | null;
}

export const DEFAULT_AUTO_APPLY_CONFIDENCE = 0.8;

/** Anything below `threshold` lands in the manager review queue instead of the dashboard. */
export function gate(
  extraction: Extraction,
  candidates: GoalCandidate[],
  explicitGoal: boolean,
  threshold: number = DEFAULT_AUTO_APPLY_CONFIDENCE,
): Decision {
  let confidence = extraction.confidence;
  const notes: string[] = [];

  if (!extraction.goal_ref) {
    return {
      state: "needs_review",
      confidence: 0,
      reason: candidates.length === 0
        ? "No active goal on file for this employee."
        : "Could not tell which goal this update is about.",
    };
  }

  if (extraction.percent === null && extraction.status === null && extraction.blockers.length === 0) {
    return { state: "needs_review", confidence: 0, reason: "No progress signal found in this message." };
  }

  // A qualitative update never auto-applies a number it does not contain.
  if (extraction.percent === null) {
    confidence = Math.min(confidence, 0.6);
    notes.push("no explicit percentage stated");
  }

  // The goal was inferred rather than addressed directly.
  if (!explicitGoal && candidates.length > 1) {
    confidence = Math.min(confidence, 0.75);
    notes.push(`inferred from ${candidates.length} active goals`);
  }

  // Progress going sharply backwards is usually a misparse, not a real regression.
  const current = candidates.find((c) => c.id === extraction.goal_ref)?.current_percent ?? null;
  if (extraction.percent !== null && current !== null && extraction.percent < current - 20) {
    confidence = Math.min(confidence, 0.5);
    notes.push(`large drop from ${current}% to ${extraction.percent}%`);
  }

  // Declaring a goal complete is high-consequence — a human signs that off.
  if (extraction.status === "done" || extraction.percent === 100) {
    confidence = Math.min(confidence, threshold - 0.01);
    notes.push("completion needs sign-off");
  }

  const state: ProgressState = confidence >= threshold ? "applied" : "needs_review";
  return {
    state,
    confidence,
    reason: state === "needs_review" ? (notes.join("; ") || extraction.reasoning) : null,
  };
}
