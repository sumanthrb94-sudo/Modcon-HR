import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireEnv } from "./http.ts";

/**
 * The service-role client every function writes through.
 *
 * Split out of ingest.ts, which is otherwise about extraction — the model
 * prompt, the confidence gate, the candidate lookup. checkin-policy needs a
 * database handle and none of that, and importing the module for five lines
 * meant deploying the extraction prompt inside a function that never extracts
 * anything.
 */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
