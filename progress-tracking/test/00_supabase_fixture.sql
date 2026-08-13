-- Minimal stand-ins for the Supabase-managed pieces, so the migrations can be
-- applied and exercised on a plain Postgres 16 instance.

create extension if not exists pgcrypto;

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

-- Stand-ins for ModCon's existing tables, so the conditional FK blocks fire.
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  email         text unique,
  slack_user_id text,
  full_name     text
);

create table if not exists public.goals (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null,
  owner_id uuid not null references public.employees(id) on delete cascade,
  title    text not null,
  status   text not null default 'active'
);
