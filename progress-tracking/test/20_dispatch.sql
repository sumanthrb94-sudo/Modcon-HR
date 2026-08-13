-- Behavioural checks for check-in dispatch. Runs after 10_behaviour.sql
-- against the same scratch database.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Fresh employee + goals so the earlier fixtures' history doesn't interfere.
insert into public.employees (id, org_id, email, slack_user_id, full_name) values
  ('33333333-3333-3333-3333-333333333333', '99999999-9999-9999-9999-999999999999',
   'meera@example.com', 'U789', 'Meera');

insert into public.goals (id, org_id, owner_id, title) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333', 'Launch referral programme'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333', 'Cut onboarding time');

-- Org default: weekly, gentle ladder.
insert into public.progress_checkin_policy (org_id, cadence_days, channel_ladder)
values ('99999999-9999-9999-9999-999999999999', 7, '{app,chat,email}'::progress_source[]);

-- ---------------------------------------------------------------------------
-- 13. Policy resolution: goal beats employee beats org
-- ---------------------------------------------------------------------------
do $$
declare pol public.progress_checkin_policy;
begin
  select * into pol from public.effective_checkin_policy('dddddddd-dddd-dddd-dddd-dddddddddddd');
  if pol.cadence_days <> 7 then raise exception 'TEST 13 FAILED: org default not used (got %)', pol.cadence_days; end if;

  insert into public.progress_checkin_policy (org_id, employee_id, cadence_days)
  values ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 3);

  select * into pol from public.effective_checkin_policy('dddddddd-dddd-dddd-dddd-dddddddddddd');
  if pol.cadence_days <> 3 then raise exception 'TEST 13 FAILED: employee override ignored (got %)', pol.cadence_days; end if;

  insert into public.progress_checkin_policy (org_id, goal_id, cadence_days, channel_ladder)
  values ('99999999-9999-9999-9999-999999999999', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1,
          '{chat,email,call}'::progress_source[]);

  select * into pol from public.effective_checkin_policy('dddddddd-dddd-dddd-dddd-dddddddddddd');
  if pol.cadence_days <> 1 then raise exception 'TEST 13 FAILED: goal override ignored (got %)', pol.cadence_days; end if;
  if pol.channel_ladder[1] <> 'chat' then raise exception 'TEST 13 FAILED: goal ladder ignored'; end if;

  -- The other goal still inherits the employee-level policy.
  select * into pol from public.effective_checkin_policy('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  if pol.cadence_days <> 3 then raise exception 'TEST 13 FAILED: sibling goal picked up the wrong policy'; end if;

  raise notice 'TEST 13 ok — goal > employee > org resolution';
end $$;

-- ---------------------------------------------------------------------------
-- 14. A never-updated goal is due immediately
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.checkin_due
   where goal_id in ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  if n <> 2 then raise exception 'TEST 14 FAILED: expected 2 due goals, got %', n; end if;
  raise notice 'TEST 14 ok — goals with no history are due immediately';
end $$;

-- ---------------------------------------------------------------------------
-- 15. A freshly updated goal is not due
-- ---------------------------------------------------------------------------
insert into public.progress_update
  (org_id, goal_id, employee_id, source, raw_text, percent, status, confidence, state, occurred_at)
values ('99999999-9999-9999-9999-999999999999', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '33333333-3333-3333-3333-333333333333', 'app', 'started today', 15, 'on_track', 1.0, 'applied', now());

do $$
declare n int;
begin
  select count(*) into n from public.checkin_due where goal_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  if n <> 0 then raise exception 'TEST 15 FAILED: freshly updated goal is still due'; end if;
  raise notice 'TEST 15 ok — a goal updated today is not chased';
end $$;

-- ---------------------------------------------------------------------------
-- 16. Claiming is atomic: a second run claims nothing
-- ---------------------------------------------------------------------------
do $$
declare first_run int; second_run int;
begin
  select count(*) into first_run from public.claim_due_checkins(50);
  select count(*) into second_run from public.claim_due_checkins(50);
  if first_run = 0 then raise exception 'TEST 16 FAILED: first run claimed nothing'; end if;
  if second_run <> 0 then raise exception 'TEST 16 FAILED: second run re-claimed % goals', second_run; end if;
  raise notice 'TEST 16 ok — % claimed, second run claimed 0', first_run;
end $$;

-- ---------------------------------------------------------------------------
-- 17. The first channel comes from the resolved ladder
-- ---------------------------------------------------------------------------
do $$
declare ch progress_source;
begin
  select channel into ch from public.progress_checkin
   where goal_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and state = 'queued';
  if ch <> 'chat' then raise exception 'TEST 17 FAILED: expected chat from the goal ladder, got %', ch; end if;
  raise notice 'TEST 17 ok — first ask goes out on the ladder head (chat)';
end $$;

-- ---------------------------------------------------------------------------
-- 18. An answer on ANY channel closes the open ask
-- ---------------------------------------------------------------------------
update public.progress_checkin set state = 'sent', sent_at = now()
 where goal_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

insert into public.progress_update
  (org_id, goal_id, employee_id, source, raw_text, percent, status, confidence, state)
values ('99999999-9999-9999-9999-999999999999', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        '33333333-3333-3333-3333-333333333333', 'email', 'about 40% now', 40, 'on_track', 0.93, 'applied');

do $$
declare st checkin_state; ans uuid;
begin
  select state, answered_by into st, ans from public.progress_checkin
   where goal_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if st <> 'answered' then raise exception 'TEST 18 FAILED: ask still % after an answer', st; end if;
  if ans is null then raise exception 'TEST 18 FAILED: answer not linked to the update'; end if;
  raise notice 'TEST 18 ok — asked on chat, answered by email, ask closed';
end $$;

-- ---------------------------------------------------------------------------
-- 19. Approving a queued event from the review queue also closes the ask
-- ---------------------------------------------------------------------------
insert into public.goals (id, org_id, owner_id, title) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333', 'Refresh careers page');

insert into public.progress_checkin (id, org_id, goal_id, employee_id, channel, state, sent_at)
values ('c1111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999',
        'ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-3333-3333-3333-333333333333', 'chat', 'sent', now());

insert into public.progress_update
  (id, org_id, goal_id, employee_id, source, raw_text, percent, confidence, state)
values ('c0000000-0000-0000-0000-00000000000a', '99999999-9999-9999-9999-999999999999',
        'ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-3333-3333-3333-333333333333',
        'chat', 'nearly wrapped up', 90, 0.5, 'needs_review');

do $$
declare st checkin_state;
begin
  select state into st from public.progress_checkin where id = 'c1111111-1111-1111-1111-111111111111';
  if st <> 'sent' then raise exception 'TEST 19 FAILED: a queued event closed the ask prematurely'; end if;

  update public.progress_update set state = 'applied',
         reviewed_by = '22222222-2222-2222-2222-222222222222', reviewed_at = now()
   where id = 'c0000000-0000-0000-0000-00000000000a';

  select state into st from public.progress_checkin where id = 'c1111111-1111-1111-1111-111111111111';
  if st <> 'answered' then raise exception 'TEST 19 FAILED: approval did not close the ask (state %)', st; end if;
  raise notice 'TEST 19 ok — review-queue approval closes the ask, pending does not';
end $$;

-- ---------------------------------------------------------------------------
-- 20. Escalation walks the ladder, then gives up instead of nagging
-- ---------------------------------------------------------------------------
insert into public.goals (id, org_id, owner_id, title) values
  ('a1111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333', 'Rewrite handbook');

insert into public.progress_checkin_policy (org_id, goal_id, cadence_days, channel_ladder, escalate_after_days)
values ('99999999-9999-9999-9999-999999999999', 'a1111111-1111-1111-1111-111111111111', 7,
        '{app,chat,email}'::progress_source[], 2);

insert into public.progress_checkin (id, org_id, goal_id, employee_id, channel, state, sent_at)
values ('c2222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999',
        'a1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
        'app', 'sent', now() - interval '3 days');

do $$
declare ch progress_source; st checkin_state; att smallint;
begin
  perform public.escalate_stale_checkins(50);
  select channel, state, attempt into ch, st, att from public.progress_checkin
   where id = 'c2222222-2222-2222-2222-222222222222';
  if ch <> 'chat' then raise exception 'TEST 20 FAILED: expected escalation app->chat, got %', ch; end if;
  if st <> 'queued' then raise exception 'TEST 20 FAILED: escalated row not re-queued (%)', st; end if;
  if att <> 2 then raise exception 'TEST 20 FAILED: attempt not incremented (%)', att; end if;

  -- chat -> email
  update public.progress_checkin set state = 'sent', sent_at = now() - interval '3 days'
   where id = 'c2222222-2222-2222-2222-222222222222';
  perform public.escalate_stale_checkins(50);
  select channel into ch from public.progress_checkin where id = 'c2222222-2222-2222-2222-222222222222';
  if ch <> 'email' then raise exception 'TEST 20 FAILED: expected chat->email, got %', ch; end if;

  -- bottom of the ladder: stop, do not loop
  update public.progress_checkin set state = 'sent', sent_at = now() - interval '3 days'
   where id = 'c2222222-2222-2222-2222-222222222222';
  perform public.escalate_stale_checkins(50);
  select state into st from public.progress_checkin where id = 'c2222222-2222-2222-2222-222222222222';
  if st <> 'skipped' then raise exception 'TEST 20 FAILED: expected skipped at ladder end, got %', st; end if;
  raise notice 'TEST 20 ok — app -> chat -> email -> give up';
end $$;

-- ---------------------------------------------------------------------------
-- 21. A recently sent ask is NOT escalated early
-- ---------------------------------------------------------------------------
do $$
declare ch progress_source;
begin
  update public.progress_checkin
     set state = 'sent', channel = 'app', sent_at = now() - interval '6 hours'
   where id = 'c2222222-2222-2222-2222-222222222222';
  perform public.escalate_stale_checkins(50);
  select channel into ch from public.progress_checkin where id = 'c2222222-2222-2222-2222-222222222222';
  if ch <> 'app' then raise exception 'TEST 21 FAILED: escalated after only 6 hours (now %)', ch; end if;
  raise notice 'TEST 21 ok — escalation waits for escalate_after_days';
end $$;

-- ---------------------------------------------------------------------------
-- 22. A goal with an open ask never appears as due again
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  update public.progress_checkin set state = 'sent' where id = 'c2222222-2222-2222-2222-222222222222';
  select count(*) into n from public.checkin_due where goal_id = 'a1111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'TEST 22 FAILED: goal with an open ask is due again'; end if;
  raise notice 'TEST 22 ok — no second ask while one is outstanding';
end $$;

-- ---------------------------------------------------------------------------
-- 23. Completed goals are left alone
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  insert into public.progress_update
    (org_id, goal_id, employee_id, source, raw_text, percent, status, confidence, state, occurred_at)
  values ('99999999-9999-9999-9999-999999999999', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          '33333333-3333-3333-3333-333333333333', 'app', 'shipped', 100, 'done', 1.0, 'applied',
          now() - interval '30 days');

  select count(*) into n from public.checkin_due where goal_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  if n <> 0 then raise exception 'TEST 23 FAILED: a finished goal is being chased'; end if;
  raise notice 'TEST 23 ok — finished goals are not chased';
end $$;

-- ---------------------------------------------------------------------------
-- 24. Employees can see their own check-ins; not each other's
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","org_id":"99999999-9999-9999-9999-999999999999","employee_id":"11111111-1111-1111-1111-111111111111","hr_role":"employee"}';

do $$
declare others int;
begin
  select count(*) into others from public.progress_checkin
   where employee_id = '33333333-3333-3333-3333-333333333333';
  if others <> 0 then raise exception 'TEST 24 FAILED: employee sees % of a colleague''s check-ins', others; end if;
  raise notice 'TEST 24 ok — check-in log is private to the person asked';
end $$;

commit;
