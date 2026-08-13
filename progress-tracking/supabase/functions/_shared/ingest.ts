import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireEnv } from "./http.ts";
import { serviceClient } from "./db.ts";
import { DEFAULT_AUTO_APPLY_CONFIDENCE, gate } from "./gate.ts";
import { isUuid } from "./parse.ts";
import type { Extraction, GoalCandidate, IngestPayload } from "./types.ts";

const AUTO_APPLY_CONFIDENCE = Number(
  Deno.env.get("AUTO_APPLY_CONFIDENCE") ?? String(DEFAULT_AUTO_APPLY_CONFIDENCE),
);
const EXTRACTION_MODEL = Deno.env.get("EXTRACTION_MODEL") ?? "claude-sonnet-4-5";
const GOALS_TABLE = Deno.env.get("GOALS_TABLE") ?? "goals";

// Re-exported so the four ingest functions keep importing it from here.
export { serviceClient };

const EXTRACTION_TOOL = {
  name: "record_progress",
  description: "Record the structured progress signal contained in an employee's update.",
  input_schema: {
    type: "object",
    properties: {
      goal_ref: {
        type: ["string", "null"],
        description:
          "The id of the goal this update is about, chosen from the candidate list. Null if the update does not clearly map to exactly one candidate.",
      },
      percent: {
        type: ["integer", "null"],
        description:
          "Completion percentage 0-100 if the person stated or clearly implied one. Null if they only described qualitative progress — never invent a number.",
      },
      status: {
        type: ["string", "null"],
        enum: ["on_track", "at_risk", "blocked", "done", null],
        description: "Overall state of the goal as the person described it.",
      },
      blockers: {
        type: "array",
        items: { type: "string" },
        description: "Short phrases naming what is blocking them. Empty array if nothing is blocking.",
      },
      summary: {
        type: "string",
        description: "One sentence, under 140 characters, in the employee's own framing. No preamble.",
      },
      confidence: {
        type: "number",
        description:
          "0-1. How confident you are that percent/status/goal_ref faithfully reflect what was said. Be strict: hedged language ('almost there', 'nearly done') is low confidence.",
      },
      reasoning: {
        type: "string",
        description: "One short sentence on what drove the confidence score. Shown to the reviewer.",
      },
    },
    required: ["goal_ref", "percent", "status", "blockers", "summary", "confidence", "reasoning"],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = `You convert messy human progress updates into structured data for an HR performance dashboard.

Rules:
- Report only what the person actually said. Never infer a percentage from enthusiasm or tone.
- "Almost done" / "nearly there" / "wrapping up" are NOT numbers. Leave percent null and lower confidence.
- If the update mentions several goals, pick the one it is mostly about; if that is genuinely ambiguous, return goal_ref null.
- Chit-chat, out-of-office notes, and questions are not progress. Return null percent, null status, empty blockers, and confidence 0.
- A blocker is something outside the person's control that is stopping them, not a general complaint.
- Never include personal, health, or family details in the summary, even if the person mentioned them. Summarise only the work.`;

async function fetchCandidates(
  db: SupabaseClient,
  payload: IngestPayload,
): Promise<GoalCandidate[]> {
  let query = db
    .from(GOALS_TABLE)
    .select("id, title, status")
    .eq("org_id", payload.org_id)
    .eq("owner_id", payload.employee_id)
    .limit(25);

  // A human ref like "GOAL-12" is a hint for the model, not a uuid filter.
  if (isUuid(payload.goal_id)) query = query.eq("id", payload.goal_id);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load candidate goals: ${error.message}`);

  const goals = data ?? [];
  if (goals.length === 0) return [];

  const { data: current } = await db
    .from("goal_progress_current")
    .select("goal_id, percent")
    .in("goal_id", goals.map((g: { id: string }) => g.id));

  const byGoal = new Map((current ?? []).map((r: { goal_id: string; percent: number | null }) => [r.goal_id, r.percent]));

  return goals.map((g: { id: string; title: string }) => ({
    id: g.id,
    title: g.title,
    current_percent: byGoal.get(g.id) ?? null,
  }));
}

async function callModel(payload: IngestPayload, candidates: GoalCandidate[]): Promise<Extraction> {
  const candidateBlock = candidates
    .map((c) => `- id: ${c.id} | "${c.title}" | currently ${c.current_percent ?? "unknown"}%`)
    .join("\n");

  const userContent = [
    `Channel: ${payload.source}`,
    `Candidate goals for this employee:\n${candidateBlock || "(none on file)"}`,
    ``,
    `Update:\n"""\n${payload.raw_text.slice(0, 12000)}\n"""`,
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Extraction model call failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  const block = (body.content ?? []).find(
    (c: { type: string; name?: string }) => c.type === "tool_use" && c.name === EXTRACTION_TOOL.name,
  );
  if (!block) throw new Error("Extraction model returned no structured output");

  const out = block.input as Extraction;
  return {
    goal_ref: out.goal_ref ?? null,
    percent: typeof out.percent === "number" ? Math.max(0, Math.min(100, Math.round(out.percent))) : null,
    status: out.status ?? null,
    blockers: Array.isArray(out.blockers) ? out.blockers.slice(0, 10) : [],
    summary: (out.summary ?? "").slice(0, 280),
    confidence: Math.max(0, Math.min(1, Number(out.confidence ?? 0))),
    reasoning: (out.reasoning ?? "").slice(0, 500),
  };
}

export interface IngestResult {
  status: "applied" | "needs_review" | "duplicate" | "ignored";
  update_id?: string;
  goal_id?: string;
  confidence?: number;
  reason?: string | null;
}

/** The one path every channel goes through. */
export async function ingestProgress(payload: IngestPayload): Promise<IngestResult> {
  const db = serviceClient();

  if (payload.source_ref) {
    const { data: existing } = await db
      .from("progress_update")
      .select("id, state")
      .eq("source", payload.source)
      .eq("source_ref", payload.source_ref)
      .maybeSingle();
    if (existing) return { status: "duplicate", update_id: existing.id };
  }

  if (!payload.raw_text?.trim()) return { status: "ignored", reason: "empty message" };

  const candidates = await fetchCandidates(db, payload);
  const extraction = await callModel(payload, candidates);
  const decision = gate(extraction, candidates, isUuid(payload.goal_id), AUTO_APPLY_CONFIDENCE);

  const goalId = isUuid(extraction.goal_ref)
    ? extraction.goal_ref
    : (isUuid(payload.goal_id) ? payload.goal_id : null);
  if (!goalId) {
    // Nothing to attach the event to. Surface it for a human rather than dropping it.
    return { status: "ignored", reason: decision.reason };
  }

  const { data, error } = await db
    .from("progress_update")
    .insert({
      org_id: payload.org_id,
      goal_id: goalId,
      employee_id: payload.employee_id,
      source: payload.source,
      source_ref: payload.source_ref ?? null,
      raw_text: payload.raw_text,
      raw_meta: payload.raw_meta ?? {},
      percent: extraction.percent,
      status: extraction.status,
      blockers: extraction.blockers,
      summary: extraction.summary,
      confidence: decision.confidence,
      state: decision.state,
      review_reason: decision.reason,
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation = a concurrent retry already landed this event.
    if (error.code === "23505") return { status: "duplicate" };
    throw new Error(`Could not store progress event: ${error.message}`);
  }

  return {
    status: decision.state === "applied" ? "applied" : "needs_review",
    update_id: data.id,
    goal_id: goalId,
    confidence: decision.confidence,
    reason: decision.reason,
  };
}

/**
 * For input a human already structured (the /progress slash command, the in-app
 * form). No model call, no review queue — they typed the number themselves.
 */
export async function applyDirect(
  payload: IngestPayload & { percent?: number | null; blockers?: string[]; summary?: string },
): Promise<IngestResult> {
  const db = serviceClient();
  const goalId = isUuid(payload.goal_id) ? payload.goal_id : null;
  if (!goalId) return { status: "ignored", reason: "no resolvable goal id" };

  const { data, error } = await db
    .from("progress_update")
    .insert({
      org_id: payload.org_id,
      goal_id: goalId,
      employee_id: payload.employee_id,
      source: payload.source,
      source_ref: payload.source_ref ?? null,
      raw_text: payload.raw_text,
      raw_meta: payload.raw_meta ?? {},
      percent: payload.percent ?? null,
      status: null,
      blockers: payload.blockers ?? [],
      summary: payload.summary ?? null,
      confidence: 1.0,
      state: "applied",
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { status: "duplicate" };
    throw new Error(`Could not store progress event: ${error.message}`);
  }
  return { status: "applied", update_id: data.id, goal_id: goalId, confidence: 1 };
}
