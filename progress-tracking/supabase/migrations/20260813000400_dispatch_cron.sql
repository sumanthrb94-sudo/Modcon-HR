-- ============================================================================
-- Hourly dispatcher schedule.
--
-- Hourly, not daily: the function itself defers anything landing inside quiet
-- hours or on a weekend, so a frequent tick simply means "send at the first
-- civilised moment" instead of "send at 3am because that's when cron ran".
--
-- Run this AFTER setting the two settings below, or the job will 401.
-- ============================================================================

-- Requested, not required. The scheduling block at the bottom already asks
-- whether pg_cron is installed before using it — but a bare `create extension`
-- up here aborts the migration first, so that guard could never be reached on
-- a server lacking the extension, and the whole file failed rather than the
-- one part of it that genuinely needs a scheduler.
--
-- Applying without them yields the dispatch function and no job: the hourly
-- tick is the only thing missing, and `select cron.schedule(...)` can be run
-- by hand once the extensions are available. Supabase provides both.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (%); the hourly check-in job will not be scheduled', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable (%); run_checkin_dispatch() cannot post until it is installed', sqlerrm;
end $$;

-- Store the endpoint and secret once, outside the job body:
--   alter database postgres set app.dispatch_url = 'https://<ref>.supabase.co/functions/v1/dispatch-checkins';
--   alter database postgres set app.dispatch_secret = '<DISPATCH_SHARED_SECRET>';

create or replace function public.run_checkin_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url    text := current_setting('app.dispatch_url', true);
  secret text := current_setting('app.dispatch_secret', true);
begin
  if url is null or secret is null then
    raise warning 'check-in dispatch skipped: app.dispatch_url / app.dispatch_secret not set';
    return;
  end if;

  perform net.http_post(
    url     := url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-webhook-secret', secret
    ),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 30000
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('modcon-checkin-dispatch')
      where exists (select 1 from cron.job where jobname = 'modcon-checkin-dispatch');

    perform cron.schedule(
      'modcon-checkin-dispatch',
      '7 * * * *',                      -- :07 past the hour, off the busy minute
      $cron$select public.run_checkin_dispatch()$cron$
    );
  end if;
end $$;

-- Pause the whole thing without dropping config:
--   select cron.unschedule('modcon-checkin-dispatch');
