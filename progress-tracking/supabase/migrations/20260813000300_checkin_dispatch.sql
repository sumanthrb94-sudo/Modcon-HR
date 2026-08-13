-- ============================================================================
-- ModCon HR — check-in dispatch
--
-- Decides WHO gets asked, on WHICH channel, and WHEN. Cadence and the channel
-- ladder are configuration, not code: an org sets a default, and specific
-- employees or goals override it.
--
-- A check-in closes itself when a progress_update arrives for the same goal,
-- whichever channel it came back on — ask on Slack, answer by email, still
-- closed.
-- ============================================================================

do $$ begin
  create type checkin_state as enum ('queued', 'sent', 'answered', 'skipped', 'failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Policy. Exactly one scope column is set: goal beats employee beats org.
-- ---------------------------------------------------------------------------

create table if not exists public.progress_checkin_policy (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  employee_id  uuid,
  goal_id      uuid,

  cadence_days smallint not null default 7 check (cadence_days between 1 and 90),

  -- Tried in order. Escalation walks down it when nobody answers.
  channel_ladder progress_source[] not null default '{app,chat,email}'::progress_source[],
  escalate_after_days smallint not null default 2 check (escalate_after_days between 1 and 30),

  -- Local-time window in which we will not contact anyone.
  quiet_start  smallint not null default 19 check (quiet_start between 0 and 23),
  quiet_end    smallint not null default 9  check (quiet_end between 0 and 23),
  timezone     text not null default 'Asia/Kolkata',

  active       boolean not null default true,
  created_at   timestamptz not null default now(),

  constraint checkin_policy_one_scope check (
    (case when employee_id is null then 0 else 1 end) +
    (case when goal_id     is null then 0 else 1 end) <= 1
  ),
  constraint checkin_policy_ladder_not_empty check (array_length(channel_ladder, 1) >= 1)
);

create unique index if not exists checkin_policy_org_default_uniq
  on public.progress_checkin_policy (org_id)
  where employee_id is null and goal_id is null;

create unique index if not exists checkin_policy_employee_uniq
  on public.progress_checkin_policy (employee_id) where employee_id is not null;

create unique index if not exists checkin_policy_goal_uniq
  on public.progress_checkin_policy (goal_id) where goal_id is not null;

comment on table public.progress_checkin_policy is
  'Cadence and channel ladder. Most specific scope wins: goal > employee > org default.';

-- ---------------------------------------------------------------------------
-- Dispatch log. One row per ask.
-- ---------------------------------------------------------------------------

create table if not exists public.progress_checkin (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  goal_id     uuid not null,
  employee_id uuid not null,

  channel     progress_source not null,
  state       checkin_state not null default 'queued',
  attempt     smallint not null default 1,

  due_at      timestamptz not null default now(),
  sent_at     timestamptz,
  answered_at timestamptz,
  answered_by uuid references public.progress_update(id) on delete set null,

  external_ref text,          -- slack ts / resend id / conversation id, for threading
  last_error   text,
  created_at   timestamptz not null default now()
);

-- At most one open ask per goal. This is what stops a chatty cron from
-- pestering somebody four times in an afternoon.
create unique index if not exists progress_checkin_one_open_per_goal
  on public.progress_checkin (goal_id)
  where state in ('queued', 'sent');

create index if not exists progress_checkin_due_idx
  on public.progress_checkin (due_at)
  where state = 'queued';

create index if not exists progress_checkin_escalation_idx
  on public.progress_checkin (sent_at)
  where state = 'sent';

create index if not exists progress_checkin_org_idx
  on public.progress_checkin (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Policy resolution
-- ---------------------------------------------------------------------------

create or replace function public.effective_checkin_policy(p_goal_id uuid)
returns public.progress_checkin_policy
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.progress_checkin_policy p
  join public.goals g on g.id = p_goal_id
  where p.active
    and (
      p.goal_id = g.id
      or (p.goal_id is null and p.employee_id = g.owner_id)
      or (p.goal_id is null and p.employee_id is null and p.org_id = g.org_id)
    )
  order by
    (p.goal_id is not null) desc,      -- goal override first
    (p.employee_id is not null) desc,  -- then employee
    p.created_at
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- What is due right now.
--
-- A goal is due when it has no open check-in and its last applied update is
-- older than the cadence. Goals nobody has ever updated are due immediately.
-- ---------------------------------------------------------------------------

create or replace view public.checkin_due
with (security_invoker = true) as
select
  g.id            as goal_id,
  g.org_id,
  g.owner_id      as employee_id,
  g.title         as goal_title,
  h.percent       as current_percent,
  h.last_update_at,
  coalesce(h.days_since_update, 9999) as days_since_update,
  pol.cadence_days,
  pol.channel_ladder,
  pol.escalate_after_days,
  pol.quiet_start,
  pol.quiet_end,
  pol.timezone,
  pol.channel_ladder[1] as first_channel
from public.goals g
cross join lateral public.effective_checkin_policy(g.id) pol
left join public.goal_progress_health h on h.goal_id = g.id
where g.status = 'active'
  and pol.id is not null
  and coalesce(h.status, 'on_track') <> 'done'
  and coalesce(h.days_since_update, 9999) >= pol.cadence_days
  and not exists (
    select 1 from public.progress_checkin c
    where c.goal_id = g.id and c.state in ('queued', 'sent')
  );

-- ---------------------------------------------------------------------------
-- Close the loop: any applied update answers the open ask for that goal,
-- no matter which channel it came back on.
-- ---------------------------------------------------------------------------

create or replace function public.progress_checkin_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state = 'applied' then
    update public.progress_checkin
       set state = 'answered',
           answered_at = now(),
           answered_by = new.id
     where goal_id = new.goal_id
       and state in ('queued', 'sent');
  end if;
  return new;
end;
$$;

drop trigger if exists progress_checkin_close_trg on public.progress_update;
create trigger progress_checkin_close_trg
  after insert on public.progress_update
  for each row execute function public.progress_checkin_close();

-- Reviewing a queued event into 'applied' should close the ask too.
create or replace function public.progress_checkin_close_on_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state = 'applied' and old.state is distinct from 'applied' then
    update public.progress_checkin
       set state = 'answered', answered_at = now(), answered_by = new.id
     where goal_id = new.goal_id
       and state in ('queued', 'sent');
  end if;
  return new;
end;
$$;

drop trigger if exists progress_checkin_close_review_trg on public.progress_update;
create trigger progress_checkin_close_review_trg
  after update on public.progress_update
  for each row execute function public.progress_checkin_close_on_review();

-- ---------------------------------------------------------------------------
-- Claim due goals atomically. Concurrent dispatcher runs cannot double-send:
-- the partial unique index rejects the second insert, and ON CONFLICT skips it.
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_checkins(p_limit int default 50)
returns setof public.progress_checkin
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.progress_checkin (org_id, goal_id, employee_id, channel, state, due_at)
  select d.org_id, d.goal_id, d.employee_id, d.first_channel, 'queued', now()
  from public.checkin_due d
  order by d.days_since_update desc
  limit p_limit
  on conflict do nothing
  returning *;
$$;

-- ---------------------------------------------------------------------------
-- Escalation: an ask that has gone unanswered moves down the ladder.
-- Returns the rows that need re-sending on a new channel.
-- ---------------------------------------------------------------------------

create or replace function public.escalate_stale_checkins(p_limit int default 50)
returns setof public.progress_checkin
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  rec record;
  pol public.progress_checkin_policy;
  next_channel progress_source;
  pos int;
begin
  for rec in
    select c.* from public.progress_checkin c
    where c.state = 'sent'
      and c.sent_at is not null
    order by c.sent_at
    limit p_limit
  loop
    select * into pol from public.effective_checkin_policy(rec.goal_id);
    continue when pol is null;
    continue when rec.sent_at > now() - make_interval(days => pol.escalate_after_days);

    pos := array_position(pol.channel_ladder, rec.channel);
    if pos is null or pos >= array_length(pol.channel_ladder, 1) then
      -- Bottom of the ladder: stop asking rather than nag forever.
      update public.progress_checkin
         set state = 'skipped', last_error = 'no answer after full channel ladder'
       where id = rec.id;
      continue;
    end if;

    next_channel := pol.channel_ladder[pos + 1];

    update public.progress_checkin
       set channel = next_channel,
           state   = 'queued',
           attempt = rec.attempt + 1,
           due_at  = now(),
           sent_at = null,
           external_ref = null
     where id = rec.id;

    return query select * from public.progress_checkin where id = rec.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.progress_checkin_policy enable row level security;
alter table public.progress_checkin        enable row level security;

drop policy if exists checkin_policy_read on public.progress_checkin_policy;
create policy checkin_policy_read on public.progress_checkin_policy
  for select to authenticated
  using (org_id = public.jwt_org_id());

drop policy if exists checkin_policy_write on public.progress_checkin_policy;
create policy checkin_policy_write on public.progress_checkin_policy
  for all to authenticated
  using (org_id = public.jwt_org_id() and public.jwt_is_reviewer())
  with check (org_id = public.jwt_org_id() and public.jwt_is_reviewer());

-- People can see when they were asked and on which channel. No hidden pings.
drop policy if exists checkin_select_own on public.progress_checkin;
create policy checkin_select_own on public.progress_checkin
  for select to authenticated
  using (employee_id = public.jwt_employee_id());

drop policy if exists checkin_select_org on public.progress_checkin;
create policy checkin_select_org on public.progress_checkin
  for select to authenticated
  using (org_id = public.jwt_org_id() and public.jwt_is_reviewer());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.progress_checkin to authenticated;
    grant select, insert, update, delete on public.progress_checkin_policy to authenticated;
    grant select on public.checkin_due to authenticated;
  end if;
end $$;

do $$
begin
  if to_regclass('public.goals') is not null
     and not exists (select 1 from pg_constraint where conname = 'progress_checkin_goal_fk') then
    alter table public.progress_checkin
      add constraint progress_checkin_goal_fk
      foreign key (goal_id) references public.goals(id) on delete cascade;
  end if;
end $$;
