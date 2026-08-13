-- Minimal stand-ins for the Supabase-managed pieces, so the migrations can be
-- applied and exercised on a plain Postgres 16 instance.

do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto unavailable (%); gen_random_uuid() comes from core on PG13+', sqlerrm;
end $$;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''),
    ''
  )::uuid;
$$;

-- `employees` and `goals` are NOT defined here any more. They are a real
-- migration now — 20260813000050_base_schema.sql — so applying that file is
-- what the suites exercise. Two definitions of the same two tables is how the
-- fixture came to be missing `employees.phone`, which dispatch-checkins
-- selects by name: the tests passed against a shape the deployed schema did
-- not have.
--
-- Apply the migrations in filename order after this file; 000050 comes first
-- and creates them.
