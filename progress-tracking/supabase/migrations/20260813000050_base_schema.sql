-- ============================================================================
-- ModCon HR — base schema for progress tracking
--
-- The four migrations that follow attach themselves to `public.goals` and
-- `public.employees` if those tables exist, and quietly skip the foreign keys
-- if they do not. That made the subsystem portable but not installable: on a
-- fresh project there was nothing to attach to, `checkin_due` selected from a
-- table that did not exist, and `supabase db push` produced a scheduler that
-- could never resolve a goal.
--
-- This migration supplies the two tables, and is deliberately additive:
--   * `create table if not exists` — a project that already has them is left
--     exactly as it is.
--   * `add column if not exists` — the columns the edge functions actually
--     select are added to an existing table rather than assumed. All nullable,
--     so no existing row is invalidated and no backfill is required.
--
-- It must run BEFORE 20260813000100 so that migration's conditional foreign
-- key blocks fire. RLS on these two tables is 20260813000500, because the
-- jwt_* claim helpers it needs are defined in 000100.
--
-- If your organisation's tables are named differently, set GOALS_TABLE and
-- EMPLOYEES_TABLE in the function environment and skip this file.
-- ============================================================================

-- gen_random_uuid() is the only thing any of these migrations wanted pgcrypto
-- for, and it has been in core since PostgreSQL 13. Requesting the extension
-- unconditionally made the whole migration fail on a server that simply does
-- not package it — a stripped or embedded build — over a function that was
-- already there. Install it where it is available, carry on where it is not.
do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto unavailable (%); gen_random_uuid() comes from core on PG13+', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Record which of the two tables this migration is about to create, before it
-- creates them.
--
-- 20260813000500 puts RLS on them, and it must only do that to tables that
-- arrived with this subsystem. Switching row-level security on over a table an
-- existing project already had would deny every read its own application makes
-- the moment the migration lands — a table deliberately left open because only
-- the service role touches it is indistinguishable, afterwards, from one that
-- was simply waiting for policies.
-- ---------------------------------------------------------------------------

create table if not exists public.progress_base_schema_owned (
  table_name text primary key
);

comment on table public.progress_base_schema_owned is
  'Tables created by progress-tracking''s base schema, and therefore safe for it to apply RLS to. Delete a row here to stop 20260813000500 managing that table.';

insert into public.progress_base_schema_owned (table_name)
select 'employees' where to_regclass('public.employees') is null
on conflict do nothing;

insert into public.progress_base_schema_owned (table_name)
select 'goals' where to_regclass('public.goals') is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- People
--
-- Only what this subsystem reads. It is not a directory: the HR app owns the
-- employee record, and this is the shape the check-in channels need in order
-- to reach somebody and to recognise them when they answer.
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  email         text,
  slack_user_id text,
  phone         text,
  full_name     text,
  created_at    timestamptz not null default now()
);

-- Columns the edge functions select by name. Added separately so an existing
-- employees table gains them rather than colliding with the create above.
alter table public.employees add column if not exists org_id        uuid;
alter table public.employees add column if not exists email         text;
alter table public.employees add column if not exists slack_user_id text;
alter table public.employees add column if not exists phone         text;
alter table public.employees add column if not exists full_name     text;

comment on column public.employees.phone is
  'E.164. Read by dispatch-checkins for the voice rung of the ladder; a null phone simply means that rung is unreachable.';

-- Unique WITHIN an organisation, not across the platform.
--
-- ingest-email resolves the sender with .ilike(email).maybeSingle() and
-- ingest-slack with .eq(slack_user_id).maybeSingle(); maybeSingle() errors on a
-- second row, that error resolves the employee to null, and the reply is
-- dropped with no record of why. Scoping uniqueness to the organisation is
-- enough to make that unreachable, because both lookups now filter by org_id
-- first — see ingest-email/index.ts and ingest-slack/index.ts.
--
-- These were once globally unique, which forbade the ambiguity instead of
-- handling it, and cost more than it bought: this is one application serving
-- many organisations, so a consultant working for two of them, a shared
-- director, or a reused test account could be recorded by the first tenant and
-- then by nobody else. See docs/checkin-policy-spec.md.
create unique index if not exists employees_email_lower_uniq
  on public.employees (org_id, lower(email))
  where email is not null;

create unique index if not exists employees_slack_user_id_uniq
  on public.employees (org_id, slack_user_id)
  where slack_user_id is not null;

create index if not exists employees_org_idx on public.employees (org_id);

-- ---------------------------------------------------------------------------
-- Goals
--
-- `status = 'active'` is what checkin_due filters on, and `owner_id` is who
-- gets asked. A goal whose owner has left is cascaded away with them: the
-- check-in ladder has nobody to chase and the progress events lose their
-- subject.
-- ---------------------------------------------------------------------------

create table if not exists public.goals (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  owner_id   uuid not null,
  title      text not null,
  status     text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.goals add column if not exists org_id   uuid;
alter table public.goals add column if not exists owner_id uuid;
alter table public.goals add column if not exists title    text;
alter table public.goals add column if not exists status   text;

-- Attached conditionally for the same reason the later migrations do it: an
-- existing employees table may not be keyed the way this one is.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_owner_fk') then
    alter table public.goals
      add constraint goals_owner_fk
      foreign key (owner_id) references public.employees(id) on delete cascade;
  end if;
exception when others then
  raise notice 'goals.owner_id -> employees.id not attached: %', sqlerrm;
end $$;

create index if not exists goals_org_status_idx on public.goals (org_id, status);
create index if not exists goals_owner_idx      on public.goals (owner_id);

comment on column public.goals.status is
  'checkin_due only chases ''active''. Anything else is left alone, which is how a goal stops being asked about without deleting its history.';
