-- ============================================================================
-- Close the surface PostgREST exposes by default.
--
-- Found by Supabase's own security advisor after deploying this schema to a
-- real project — none of it is reachable on a plain Postgres, which is why the
-- local suites never saw it. Everything in the `public` schema is published as
-- a REST API, including functions, and `security definer` means they run with
-- the definer's rights no matter who calls them.
--
-- Three separate problems, all of them ours:
--
--   1. org_directory had no RLS. It is the tenant list — every organisation on
--      the platform and its Slack workspace id — readable by anyone with the
--      anon key, which ships in the client bundle.
--   2. The dispatcher's internals were callable over /rest/v1/rpc/. A stranger
--      could create directory rows (org_id_for_key), claim or escalate
--      check-ins, or fire run_checkin_dispatch's outbound POST.
--   3. The jwt_* helpers had a mutable search_path, and every RLS policy in
--      this subsystem is written in terms of them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS on the two tables that never got it
--
-- No policies deliberately: the service role bypasses RLS, and nothing else
-- has any business reading either table. An empty policy set is a closed door,
-- not an unfinished one.
-- ---------------------------------------------------------------------------

alter table public.org_directory              enable row level security;
alter table public.progress_base_schema_owned enable row level security;

revoke all on public.org_directory              from anon, authenticated;
revoke all on public.progress_base_schema_owned from anon, authenticated;

comment on table public.org_directory is
  'Tenant identity. RLS on with no policies: service role only. The anon key ships in the client bundle, so anything readable by anon is public.';

-- ---------------------------------------------------------------------------
-- 2. Functions that are not an API
--
-- Trigger bodies and dispatcher internals. `security definer` without a revoke
-- is an escalation waiting to be called by name.
-- ---------------------------------------------------------------------------

-- FROM PUBLIC, not from anon and authenticated.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and both Supabase roles
-- inherit it from there — the acl reads `=X/postgres`. Revoking the named
-- roles leaves that grant untouched and changes nothing, which is exactly what
-- the first attempt at this migration did: the advisor still reported every
-- one of these afterwards. service_role holds its own explicit grant
-- (`service_role=X/postgres`), so it keeps working.

revoke execute on function public.org_id_for_key(text)                       from public, anon, authenticated;
revoke execute on function public.claim_due_checkins(int)                    from public, anon, authenticated;
revoke execute on function public.escalate_stale_checkins(int)               from public, anon, authenticated;
revoke execute on function public.run_checkin_dispatch()                     from public, anon, authenticated;
revoke execute on function public.progress_checkin_close()                   from public, anon, authenticated;
revoke execute on function public.progress_checkin_close_on_review()         from public, anon, authenticated;
revoke execute on function public.progress_update_audit_write()              from public, anon, authenticated;
revoke execute on function public.progress_update_guard()                    from public, anon, authenticated;
revoke execute on function public.has_channel_consent(uuid, progress_source) from public, anon, authenticated;

-- effective_checkin_policy loses the blanket grant and gets one back for
-- signed-in users only. The checkin_due view is security_invoker and joins it
-- laterally, so a signed-in employee needs EXECUTE to see what they are about
-- to be asked — that is a feature, not an internal.
revoke execute on function public.effective_checkin_policy(uuid) from public, anon, authenticated;
grant  execute on function public.effective_checkin_policy(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pin the search_path on the claim helpers
--
-- These decide who may read what. A mutable search_path means the schema they
-- resolve against depends on the caller's settings, which is not a property
-- access control should have. Empty rather than `public`: every reference
-- inside them is already schema-qualified or a pg_catalog builtin.
-- ---------------------------------------------------------------------------

alter function public.jwt_claim(text)         set search_path = '';
alter function public.jwt_org_id()            set search_path = '';
alter function public.jwt_employee_id()       set search_path = '';
alter function public.jwt_role_name()         set search_path = '';
alter function public.jwt_is_reviewer()       set search_path = '';
alter function public.progress_update_guard() set search_path = '';
