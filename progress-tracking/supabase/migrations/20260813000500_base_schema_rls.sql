-- ============================================================================
-- ModCon HR — row-level security for the base schema
--
-- Split from 20260813000050 for two reasons:
--
--   1. The jwt_* claim helpers these policies are written in terms of are
--      defined in 20260813000100, which runs between the two.
--   2. It only ever touches tables the base schema itself created. A project
--      that already had `goals` or `employees` keeps whatever access rules it
--      already had — turning RLS on over a live table denies every read that
--      is not covered by a policy written the same second, and the failure
--      shows up as an application that has silently gone blank.
--
-- The shape matches progress_update: you see your own, reviewers see the
-- organisation's. Nothing here grants a write. The HR application owns these
-- records, the edge functions reach them with the service role (which bypasses
-- RLS), and an employee editing their own goal title is a different feature
-- with a different audit story.
-- ============================================================================

do $$
declare
  owns_employees boolean := exists (
    select 1 from public.progress_base_schema_owned where table_name = 'employees'
  );
  owns_goals boolean := exists (
    select 1 from public.progress_base_schema_owned where table_name = 'goals'
  );
begin
  -- -------------------------------------------------------------------------
  -- employees
  -- -------------------------------------------------------------------------
  if owns_employees then
    execute 'alter table public.employees enable row level security';

    -- Your own record. jwt_employee_id() is the employee this token stands for.
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'employees'
                     and policyname = 'employees_select_self') then
      execute $p$
        create policy employees_select_self on public.employees
          for select to authenticated
          using (id = public.jwt_employee_id())
      $p$;
    end if;

    -- Everyone in the organisation, for a manager / hr_admin / owner. This is
    -- what makes the review queue and the dispatcher's recipient lookup
    -- readable to a human checking why somebody was or was not asked.
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'employees'
                     and policyname = 'employees_select_org') then
      execute $p$
        create policy employees_select_org on public.employees
          for select to authenticated
          using (org_id = public.jwt_org_id() and public.jwt_is_reviewer())
      $p$;
    end if;

    execute 'grant select on public.employees to authenticated';
  else
    raise notice 'employees pre-existed this subsystem; leaving its access rules alone';
  end if;

  -- -------------------------------------------------------------------------
  -- goals
  -- -------------------------------------------------------------------------
  if owns_goals then
    execute 'alter table public.goals enable row level security';

    -- The goals you are asked about are the goals you own.
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'goals'
                     and policyname = 'goals_select_own') then
      execute $p$
        create policy goals_select_own on public.goals
          for select to authenticated
          using (owner_id = public.jwt_employee_id())
      $p$;
    end if;

    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = 'goals'
                     and policyname = 'goals_select_org') then
      execute $p$
        create policy goals_select_org on public.goals
          for select to authenticated
          using (org_id = public.jwt_org_id() and public.jwt_is_reviewer())
      $p$;
    end if;

    execute 'grant select on public.goals to authenticated';
  else
    raise notice 'goals pre-existed this subsystem; leaving its access rules alone';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- checkin_due and the progress views are security_invoker, so they are read
-- through the caller's policies rather than around them. An employee querying
-- checkin_due sees their own pending asks and nobody else's; the dispatcher
-- sees all of them because it connects as the service role.
--
-- This is asserted in test/20_dispatch.sql ("check-in privacy").
-- ---------------------------------------------------------------------------
