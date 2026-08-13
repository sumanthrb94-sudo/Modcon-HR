export type ProgressSource = "call" | "chat" | "email" | "app" | "system";
export type ProgressStatus = "on_track" | "at_risk" | "blocked" | "done";
export type ProgressState = "applied" | "needs_review" | "rejected";

/** What every channel adapter hands to the extractor. */
export interface IngestPayload {
  org_id: string;
  employee_id: string;
  /** Omit to let the extractor match the update against the employee's active goals. */
  goal_id?: string;
  source: ProgressSource;
  /** Stable per-delivery id (call sid, slack ts, message-id) — makes retries idempotent. */
  source_ref?: string;
  raw_text: string;
  raw_meta?: Record<string, unknown>;
  occurred_at?: string;
}

/** What the model is asked to return. */
export interface Extraction {
  goal_ref: string | null;
  percent: number | null;
  status: ProgressStatus | null;
  blockers: string[];
  summary: string;
  confidence: number;
  reasoning: string;
}

export interface GoalCandidate {
  id: string;
  title: string;
  current_percent: number | null;
}
