-- Behavioural checks for the progress schema. Run against a scratch database.
-- Every block raises an exception if the invariant is violated.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.employees (id, org_id, email, slack_user_id, full_name) values
  ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999',
   'asha@example.com', 'U123', 'Asha'),
  ('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999',
   'ravi@example.com', 'U456', 'Ravi');

insert into public.goals (id, org_id, owner_id, title) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999',
   '11111111-1111-1111-1111-111111111111', 'Ship onboarding revamp'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '99999999-9999-9999-9999-999999999999',
   '22222222-2222-2222-2222-222222222222', 'Reduce support backlog');

-- ---------------------------------------------------------------------------
-- 1. Conditional foreign keys attached to the real tables
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progress_update_goal_fk')
  or not exists (select 1 from pg_constraint where conname = 'progress_update_employee_fk')
  or not exists (select 1 from pg_constraint where conname = 'progress_channel_consent_employee_fk')
  then raise exception 'TEST 1 FAILED: conditional foreign keys were not attached'; end if;
  raise notice 'TEST 1 ok — foreign keys attached';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Latest APPLIED event wins; needs_review events are invisible to the rollup
-- ---------------------------------------------------------------------------
insert into public.progress_update
  (id, org_id, goal_id, employee_id, source, source_ref, raw_text, percent, status, confidence, state, occurred_at)
values
  ('c0000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'app', null, 'kicked off', 20, 'on_track', 1.0, 'applied', now() - interval '10 days'),
  ('c0000000-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'call', 'call:abc', 'design is done, build starts monday', 55, 'on_track', 0.91, 'applied', now() - interval '2 days'),
  ('c0000000-0000-0000-0000-000000000003', '99999999-9999-9999-9999-999999999999',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'chat', 'slack:C1:1', 'almost there honestly', 90, null, 0.44, 'needs_review', now()),
  ('c0000000-0000-0000-0000-000000000004', '99999999-9999-9999-9999-999999999999',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'email', 'email:m1', 'stuck waiting on vendor access', 30, 'blocked', 0.88, 'applied', now() - interval '21 days');

do $$
declare p int; d int;
begin
  select percent, days_since_update into p, d
    from public.goal_progress_current where goal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if p <> 55 then raise exception 'TEST 2 FAILED: expected 55%%, got %', p; end if;
  if d <> 2  then raise exception 'TEST 2 FAILED: expected 2 days stale, got %', d; end if;
  raise notice 'TEST 2 ok — latest applied event wins (55%%, 2 days old)';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Health classification: old + blocked goal reads as stale
-- ---------------------------------------------------------------------------
do $$
declare h text;
begin
  select health into h from public.goal_progress_health
    where goal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if h <> 'stale' then raise exception 'TEST 3 FAILED: expected stale, got %', h; end if;
  raise notice 'TEST 3 ok — 21-day-old goal classified stale';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Org rollup numbers for the dashboard tiles
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from public.org_progress_rollup
    where org_id = '99999999-9999-9999-9999-999999999999';
  if r.tracked_goals <> 2 then raise exception 'TEST 4 FAILED: tracked_goals = %', r.tracked_goals; end if;
  if r.avg_goal_progress <> 43 then raise exception 'TEST 4 FAILED: avg = %', r.avg_goal_progress; end if;
  if r.stale_goals <> 1 then raise exception 'TEST 4 FAILED: stale = %', r.stale_goals; end if;
  raise notice 'TEST 4 ok — rollup: % goals, avg %%%, % stale',
    r.tracked_goals, r.avg_goal_progress, r.stale_goals;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Append-only guard: extracted values cannot be edited
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.progress_update set percent = 99
      where id = 'c0000000-0000-0000-0000-000000000002';
    raise exception 'TEST 5 FAILED: percent edit was allowed';
  exception when check_violation then
    raise notice 'TEST 5 ok — percent edit blocked by guard trigger';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Review flow: state may change, and it lands in the audit trail
-- ---------------------------------------------------------------------------
update public.progress_update
   set state = 'rejected', reviewed_by = '22222222-2222-2222-2222-222222222222',
       reviewed_at = now(), review_reason = 'no number actually stated'
 where id = 'c0000000-0000-0000-0000-000000000003';

do $$
declare n int; last_to progress_state;
begin
  select count(*) into n from public.progress_update_audit
    where update_id = 'c0000000-0000-0000-0000-000000000003';
  select to_state into last_to from public.progress_update_audit
    where update_id = 'c0000000-0000-0000-0000-000000000003' order by at desc, id desc limit 1;
  if n < 2 then raise exception 'TEST 6 FAILED: expected insert + transition rows, got %', n; end if;
  if last_to <> 'rejected' then raise exception 'TEST 6 FAILED: last audit state = %', last_to; end if;
  raise notice 'TEST 6 ok — review recorded, % audit rows', n;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Idempotency: the same webhook delivery cannot land twice
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.progress_update
      (org_id, goal_id, employee_id, source, source_ref, raw_text, percent, confidence, state)
    values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111', 'call', 'call:abc', 'retry of same call', 55, 0.9, 'applied');
    raise exception 'TEST 7 FAILED: duplicate source_ref was accepted';
  exception when unique_violation then
    raise notice 'TEST 7 ok — duplicate webhook delivery rejected';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. An event with no signal at all is refused
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.progress_update
      (org_id, goal_id, employee_id, source, raw_text, confidence, state)
    values ('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111', 'chat', 'out of office today', 0.1, 'needs_review');
    raise exception 'TEST 8 FAILED: signal-free event was accepted';
  exception when check_violation then
    raise notice 'TEST 8 ok — signal-free chatter rejected';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Consent gate
-- ---------------------------------------------------------------------------
do $$
begin
  if public.has_channel_consent('11111111-1111-1111-1111-111111111111', 'call') then
    raise exception 'TEST 9 FAILED: consent reported before it was granted';
  end if;

  insert into public.progress_channel_consent (org_id, employee_id, channel, notice_text)
  values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
          'call', 'This check-in call is transcribed for goal tracking.');

  if not public.has_channel_consent('11111111-1111-1111-1111-111111111111', 'call') then
    raise exception 'TEST 9 FAILED: consent not detected after granting';
  end if;

  update public.progress_channel_consent set revoked_at = now()
   where employee_id = '11111111-1111-1111-1111-111111111111' and channel = 'call';

  if public.has_channel_consent('11111111-1111-1111-1111-111111111111', 'call') then
    raise exception 'TEST 9 FAILED: revoked consent still reads as granted';
  end if;
  raise notice 'TEST 9 ok — consent grant and revoke both honoured';
end $$;

-- ---------------------------------------------------------------------------
-- 10. RLS: an employee sees only their own events
-- ---------------------------------------------------------------------------
-- Grants come from the migration itself; nothing extra needed here.

-- SET LOCAL only takes effect inside an explicit transaction.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","org_id":"99999999-9999-9999-9999-999999999999","employee_id":"11111111-1111-1111-1111-111111111111","hr_role":"employee"}';

do $$
declare mine int; others int;
begin
  select count(*) into mine from public.progress_update
    where employee_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into others from public.progress_update
    where employee_id = '22222222-2222-2222-2222-222222222222';
  if mine = 0 then raise exception 'TEST 10 FAILED: employee cannot see their own events'; end if;
  if others <> 0 then raise exception 'TEST 10 FAILED: employee can see % events belonging to a colleague', others; end if;
  raise notice 'TEST 10 ok — employee sees % own events, 0 belonging to others', mine;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 11. RLS: a manager sees the whole org
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","org_id":"99999999-9999-9999-9999-999999999999","employee_id":"22222222-2222-2222-2222-222222222222","hr_role":"manager"}';

do $$
declare n int;
begin
  select count(*) into n from public.progress_update;
  if n < 4 then raise exception 'TEST 11 FAILED: manager sees only % events', n; end if;
  raise notice 'TEST 11 ok — manager sees all % org events', n;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 12. RLS: an employee cannot forge an auto-applied event for someone else
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","org_id":"99999999-9999-9999-9999-999999999999","employee_id":"11111111-1111-1111-1111-111111111111","hr_role":"employee"}';

do $$
begin
  begin
    insert into public.progress_update (org_id, goal_id, employee_id, source, raw_text, percent, confidence, state)
    values ('99999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '22222222-2222-2222-2222-222222222222', 'app', 'ravi is at 100%', 100, 1.0, 'applied');
    raise exception 'TEST 12 FAILED: employee wrote an event for a colleague';
  exception when insufficient_privilege then
    raise notice 'TEST 12 ok — cross-employee write refused by RLS';
  end;
end $$;

commit;
