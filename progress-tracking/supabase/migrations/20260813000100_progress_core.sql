-- ============================================================================
-- ModCon HR — live progress tracking, core schema
--
-- One append-only event table (progress_update) fed by every channel:
-- voice calls, chat, email, in-app forms. A goal's current progress is
-- DERIVED from the latest applied event, never written directly.
--
-- Foreign keys to goals/employees are attached conditionally at the bottom
-- so this migration applies cleanly whatever those tables are named today.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type progress_source as enum ('call', 'chat', 'email', 'app', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type progress_status as enum ('on_track', 'at_risk', 'blocked', 'done');
exception when duplicate_object then null; end $$;

-- applied      -> counts toward the goal's current progress
-- needs_review -> extracted but not confident enough to trust; manager queue
-- rejected     -> manager said this is wrong; kept for audit, never counted
do $$ begin
  create type progress_state as enum ('applied', 'needs_review', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Event table
-- ---------------------------------------------------------------------------

create table if not exists public.progress_update (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  goal_id       uuid not null,
  employee_id   uuid not null,

  -- provenance
  source        progress_source not null,
  source_ref    text,                                  -- call sid / slack ts / message-id
  raw_text      text,                                  -- transcript or message body, verbatim
  raw_meta      jsonb not null default '{}'::jsonb,    -- channel payload crumbs (duration, thread, from)

  -- extracted signal
  percent       smallint check (percent between 0 and 100),
  status        progress_status,
  blockers      text[] not null default '{}',
  summary       text,                                  -- one-line human-readable delta

  -- trust
  confidence    real not null default 1.0 check (confidence >= 0 and confidence <= 1),
  state         progress_state not null default 'needs_review',
  review_reason text,                                  -- why it landed in the queue
  reviewed_by   uuid,
  reviewed_at   timestamptz,

  occurred_at   timestamptz not null default now(),    -- when the human actually said it
  created_at    timestamptz not null default now(),

  -- coalesce matters: array_length on an empty array returns NULL, and a NULL
  -- check constraint passes. Without it, signal-free chatter gets stored.
  constraint progress_update_has_signal
    check (
      percent is not null
      or status is not null
      or coalesce(array_length(blockers, 1), 0) > 0
    ),
  -- An event still in the queue cannot already carry a review stamp.
  -- (Auto-applied events legitimately have no reviewer at all.)
  constraint progress_update_review_fields
    check (not (state = 'needs_review' and reviewed_at is not null))
);

comment on table public.progress_update is
  'Append-only progress events from every channel. Never UPDATE percent/raw_text — file a new event instead.';

-- Idempotent webhook delivery: the same call/message can never double-post.
create unique index if not exists progress_update_source_ref_uniq
  on public.progress_update (source, source_ref)
  where source_ref is not null;

create index if not exists progress_update_goal_time_idx
  on public.progress_update (goal_id, occurred_at desc);

create index if not exists progress_update_employee_time_idx
  on public.progress_update (employee_id, occurred_at desc);

-- Powers the "Needs review (3)" chip without scanning history.
create index if not exists progress_update_review_queue_idx
  on public.progress_update (org_id, created_at desc)
  where state = 'needs_review';

create index if not exists progress_update_org_time_idx
  on public.progress_update (org_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Immutability: provenance and extracted values are write-once.
-- Reviewers may only move state / reviewed_by / reviewed_at / review_reason.
-- ---------------------------------------------------------------------------

create or replace function public.progress_update_guard()
returns trigger
language plpgsql
as $$
begin
  if new.org_id      is distinct from old.org_id
  or new.goal_id     is distinct from old.goal_id
  or new.employee_id is distinct from old.employee_id
  or new.source      is distinct from old.source
  or new.source_ref  is distinct from old.source_ref
  or new.raw_text    is distinct from old.raw_text
  or new.percent     is distinct from old.percent
  or new.status      is distinct from old.status
  or new.blockers    is distinct from old.blockers
  or new.confidence  is distinct from old.confidence
  or new.occurred_at is distinct from old.occurred_at
  then
    raise exception
      'progress_update is append-only: only state/review fields may change (event %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists progress_update_guard_trg on public.progress_update;
create trigger progress_update_guard_trg
  before update on public.progress_update
  for each row execute function public.progress_update_guard();

-- ---------------------------------------------------------------------------
-- Audit trail — who changed a number, when, and why.
-- ---------------------------------------------------------------------------

create table if not exists public.progress_update_audit (
  id         bigserial primary key,
  update_id  uuid not null references public.progress_update(id) on delete cascade,
  org_id     uuid not null,
  actor_id   uuid,
  actor_role text,
  from_state progress_state,
  to_state   progress_state not null,
  reason     text,
  at         timestamptz not null default now()
);

create index if not exists progress_update_audit_update_idx
  on public.progress_update_audit (update_id, at desc);

create or replace function public.progress_update_audit_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.progress_update_audit (update_id, org_id, actor_id, actor_role, from_state, to_state, reason)
    values (new.id, new.org_id, auth.uid(), public.jwt_role_name(), null, new.state, new.review_reason);
  elsif new.state is distinct from old.state then
    insert into public.progress_update_audit (update_id, org_id, actor_id, actor_role, from_state, to_state, reason)
    values (new.id, new.org_id, auth.uid(), public.jwt_role_name(), old.state, new.state, new.review_reason);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim helpers. Requires org_id / employee_id / hr_role in the JWT
-- (set them in a custom access token hook).
-- ---------------------------------------------------------------------------

create or replace function public.jwt_claim(claim text)
returns text
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> claim,
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> claim
    ),
    ''
  );
$$;

create or replace function public.jwt_org_id()
returns uuid language sql stable as $$ select public.jwt_claim('org_id')::uuid $$;

create or replace function public.jwt_employee_id()
returns uuid language sql stable as $$ select public.jwt_claim('employee_id')::uuid $$;

create or replace function public.jwt_role_name()
returns text language sql stable as $$ select coalesce(public.jwt_claim('hr_role'), 'employee') $$;

create or replace function public.jwt_is_reviewer()
returns boolean language sql stable as $$
  select public.jwt_role_name() in ('manager', 'hr_admin', 'owner')
$$;

drop trigger if exists progress_update_audit_trg on public.progress_update;
create trigger progress_update_audit_trg
  after insert or update on public.progress_update
  for each row execute function public.progress_update_audit_write();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.progress_update       enable row level security;
alter table public.progress_update_audit enable row level security;

-- Everyone sees their own events. This is the promise that keeps the feature
-- on the right side of "tracking work" vs "watching people".
drop policy if exists progress_update_select_own on public.progress_update;
create policy progress_update_select_own on public.progress_update
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists progress_update_select_org on public.progress_update;
create policy progress_update_select_org on public.progress_update
  for select to authenticated
  using (org_id = public.jwt_org_id() and public.jwt_is_reviewer());

-- Employees self-report in-app. Anything richer arrives via edge functions
-- running as service_role, which bypasses RLS.
drop policy if exists progress_update_insert_own on public.progress_update;
create policy progress_update_insert_own on public.progress_update
  for insert to authenticated
  with check (
    employee_id = public.jwt_employee_id()
    and org_id  = public.jwt_org_id()
    and source  = 'app'
    and state   = 'applied'
    and confidence = 1.0
  );

-- Only reviewers clear the queue; the guard trigger limits what they can touch.
drop policy if exists progress_update_review on public.progress_update;
create policy progress_update_review on public.progress_update
  for update to authenticated
  using (org_id = public.jwt_org_id() and public.jwt_is_reviewer())
  with check (org_id = public.jwt_org_id() and public.jwt_is_reviewer());

drop policy if exists progress_update_audit_select on public.progress_update_audit;
create policy progress_update_audit_select on public.progress_update_audit
  for select to authenticated
  using (org_id = public.jwt_org_id() and public.jwt_is_reviewer());

-- ---------------------------------------------------------------------------
-- Derived views — what the Performance page actually reads
-- ---------------------------------------------------------------------------

-- Latest applied event per goal. This is the single source of "progress".
create or replace view public.goal_progress_current
with (security_invoker = true) as
select distinct on (u.goal_id)
  u.goal_id,
  u.org_id,
  u.employee_id,
  u.percent,
  u.status,
  u.blockers,
  u.summary,
  u.source        as last_source,
  u.occurred_at   as last_update_at,
  extract(day from now() - u.occurred_at)::int as days_since_update
from public.progress_update u
where u.state = 'applied'
order by u.goal_id, u.occurred_at desc, u.created_at desc;

-- Freshness beats progress: "last update 9 days ago" is the stronger signal.
create or replace view public.goal_progress_health
with (security_invoker = true) as
select
  c.*,
  case
    when c.status = 'done'            then 'done'
    when c.days_since_update >= 14    then 'stale'
    when c.status = 'blocked'         then 'blocked'
    when c.days_since_update >= 7     then 'quiet'
    when c.status = 'at_risk'         then 'at_risk'
    else 'healthy'
  end as health
from public.goal_progress_current c;

-- Feeds the four tiles at the top of /performance.
create or replace view public.org_progress_rollup
with (security_invoker = true) as
select
  org_id,
  count(*)                                              as tracked_goals,
  round(avg(percent))                                   as avg_goal_progress,
  count(*) filter (where health = 'stale')              as stale_goals,
  count(*) filter (where health in ('blocked','at_risk')) as goals_needing_attention,
  max(last_update_at)                                   as last_activity_at
from public.goal_progress_health
group by org_id;

-- ---------------------------------------------------------------------------
-- Attach foreign keys only if the referenced tables exist.
-- Adjust the table names here if yours differ.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.goals') is not null
     and not exists (select 1 from pg_constraint where conname = 'progress_update_goal_fk') then
    alter table public.progress_update
      add constraint progress_update_goal_fk
      foreign key (goal_id) references public.goals(id) on delete cascade;
  end if;

  if to_regclass('public.employees') is not null
     and not exists (select 1 from pg_constraint where conname = 'progress_update_employee_fk') then
    alter table public.progress_update
      add constraint progress_update_employee_fk
      foreign key (employee_id) references public.employees(id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase normally does this via default privileges; being explicit
-- keeps the migration portable and makes the intent readable.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update on public.progress_update to authenticated;
    grant select on public.progress_update_audit to authenticated;
    grant select on public.goal_progress_current, public.goal_progress_health,
                    public.org_progress_rollup to authenticated;
    -- No delete, ever: this table is the audit record.
    revoke delete on public.progress_update from authenticated;
  end if;
end $$;

-- Realtime activity feed on /performance
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.progress_update;
  end if;
exception when duplicate_object then null;
end $$;
