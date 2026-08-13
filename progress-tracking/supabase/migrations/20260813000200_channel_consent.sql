-- ============================================================================
-- Per-employee, per-channel consent.
--
-- Voice capture in particular must be opt-in and revocable. The voice adapter
-- refuses to store a transcript without a live consent row, so "we forgot to
-- ask" fails closed rather than quietly recording someone.
-- ============================================================================

create table if not exists public.progress_channel_consent (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  employee_id uuid not null,
  channel     progress_source not null,
  granted     boolean not null default true,
  -- Voice specifically: did they hear the recording notice on this channel?
  notice_text text,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (employee_id, channel)
);

create index if not exists progress_channel_consent_lookup_idx
  on public.progress_channel_consent (employee_id, channel)
  where granted and revoked_at is null;

alter table public.progress_channel_consent enable row level security;

-- Employees can always see and revoke their own consent.
drop policy if exists consent_select_own on public.progress_channel_consent;
create policy consent_select_own on public.progress_channel_consent
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists consent_update_own on public.progress_channel_consent;
create policy consent_update_own on public.progress_channel_consent
  for update to authenticated
  using (employee_id = public.jwt_employee_id())
  with check (employee_id = public.jwt_employee_id());

drop policy if exists consent_insert_own on public.progress_channel_consent;
create policy consent_insert_own on public.progress_channel_consent
  for insert to authenticated
  with check (
    employee_id = public.jwt_employee_id()
    and org_id = public.jwt_org_id()
  );

drop policy if exists consent_select_org on public.progress_channel_consent;
create policy consent_select_org on public.progress_channel_consent
  for select to authenticated
  using (org_id = public.jwt_org_id() and public.jwt_is_reviewer());

create or replace function public.has_channel_consent(p_employee uuid, p_channel progress_source)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.progress_channel_consent
    where employee_id = p_employee
      and channel = p_channel
      and granted
      and revoked_at is null
  );
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update on public.progress_channel_consent to authenticated;
  end if;
end $$;

do $$
begin
  if to_regclass('public.employees') is not null
     and not exists (select 1 from pg_constraint where conname = 'progress_channel_consent_employee_fk') then
    alter table public.progress_channel_consent
      add constraint progress_channel_consent_employee_fk
      foreign key (employee_id) references public.employees(id) on delete cascade;
  end if;
end $$;
