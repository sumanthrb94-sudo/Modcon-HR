-- ============================================================================
-- One application, many organisations.
--
-- Every assertion here failed, or could not be written at all, while
-- employees.email and employees.slack_user_id were globally unique. The point
-- of the suite is that a person can exist in two organisations and that an
-- inbound message is attributed to the organisation it was addressed to —
-- never to whichever row happened to match first.
--
-- Run after the migrations, on a database that has also run 00_supabase_fixture.
-- Seeds its own organisations; safe to run on a database 10_ and 20_ have used.
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- Two organisations, and one person who works for both.
insert into public.org_directory (org_id, org_key, slack_team_id) values
  ('a0000000-0000-0000-0000-000000000001', 'alpha', 'T_ALPHA'),
  ('a0000000-0000-0000-0000-000000000002', 'beta',  'T_BETA');

-- ---------------------------------------------------------------------------
-- TEST 1 — the same address in two organisations
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.employees (id, org_id, email, slack_user_id, full_name) values
    ('e0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000001', 'shared@example.com', 'U_SHARED', 'Consultant at Alpha');

  insert into public.employees (id, org_id, email, slack_user_id, full_name) values
    ('e0000000-0000-0000-0000-000000000002',
     'a0000000-0000-0000-0000-000000000002', 'shared@example.com', 'U_SHARED', 'Consultant at Beta');

  raise notice 'TEST 1 ok — one address and one slack id recorded by two organisations';
exception when unique_violation then
  raise exception 'TEST 1 FAILED — uniqueness is still platform-wide: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2 — still unambiguous inside one organisation
--
-- This is the property the lookups depend on: .maybeSingle() errors on a second
-- row, and that error resolves the employee to null, dropping the reply
-- silently. Per-organisation uniqueness is enough to make it unreachable,
-- because both lookups now filter by org_id first.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.employees (id, org_id, email, full_name) values
    ('e0000000-0000-0000-0000-000000000003',
     'a0000000-0000-0000-0000-000000000001', 'SHARED@example.com', 'Same address, same org');
  raise exception 'TEST 2 FAILED — a duplicate address was accepted within one organisation';
exception when unique_violation then
  raise notice 'TEST 2 ok — duplicate address refused within an organisation, case-insensitively';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3 — the email lookup resolves through the goal's organisation
--
-- What ingest-email does: take the org from the goal named in the reply-to,
-- then find the sender inside it. Asserted as the query rather than the
-- function, since the function needs a running edge runtime.
-- ---------------------------------------------------------------------------
insert into public.goals (id, org_id, owner_id, title) values
  ('60000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000002', 'A goal that belongs to Beta');

do $$
declare
  goal_org uuid;
  resolved uuid;
begin
  select org_id into goal_org from public.goals
   where id = '60000000-0000-0000-0000-000000000001';

  select id into resolved from public.employees
   where org_id = goal_org and lower(email) = lower('shared@example.com');

  if resolved is null then
    raise exception 'TEST 3 FAILED — the sender was not found in the goal''s organisation';
  end if;
  if resolved <> 'e0000000-0000-0000-0000-000000000002' then
    raise exception 'TEST 3 FAILED — resolved to %, which is the other organisation''s record', resolved;
  end if;
  raise notice 'TEST 3 ok — a reply to Beta''s goal resolves to Beta''s employee, not Alpha''s';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4 — an unmapped Slack workspace resolves to nobody
-- ---------------------------------------------------------------------------
do $$
declare
  org_for_team uuid;
begin
  select org_id into org_for_team from public.org_directory where slack_team_id = 'T_UNCLAIMED';
  if org_for_team is not null then
    raise exception 'TEST 4 FAILED — an unclaimed workspace resolved to organisation %', org_for_team;
  end if;
  raise notice 'TEST 4 ok — a workspace no organisation has claimed resolves to nobody';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5 — the same slack user id in two workspaces reaches two people
-- ---------------------------------------------------------------------------
do $$
declare
  alpha_person uuid;
  beta_person  uuid;
begin
  select e.id into alpha_person
    from public.employees e
    join public.org_directory d on d.org_id = e.org_id
   where d.slack_team_id = 'T_ALPHA' and e.slack_user_id = 'U_SHARED';

  select e.id into beta_person
    from public.employees e
    join public.org_directory d on d.org_id = e.org_id
   where d.slack_team_id = 'T_BETA' and e.slack_user_id = 'U_SHARED';

  if alpha_person is null or beta_person is null then
    raise exception 'TEST 5 FAILED — one of the workspaces resolved to nobody';
  end if;
  if alpha_person = beta_person then
    raise exception 'TEST 5 FAILED — both workspaces resolved to the same person';
  end if;
  raise notice 'TEST 5 ok — one slack id in two workspaces reaches two different people';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6 — a workspace cannot belong to two organisations
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.org_directory (org_id, org_key, slack_team_id) values
    ('a0000000-0000-0000-0000-000000000003', 'gamma', 'T_ALPHA');
  raise exception 'TEST 6 FAILED — one workspace was claimed by two organisations';
exception when unique_violation then
  raise notice 'TEST 6 ok — a Slack workspace belongs to at most one organisation';
end $$;

rollback;
