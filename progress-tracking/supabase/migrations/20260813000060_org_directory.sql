-- ============================================================================
-- Which organisation is this?
--
-- One ModCon HR application serves many organisations, and until now nothing
-- in this subsystem could answer that question about an inbound message. The
-- Slack ingest looked up an employee by `slack_user_id` alone and used
-- whichever row came back — correct only while exactly one workspace existed.
--
-- This table is the mapping. It is deliberately small: identity of a tenant,
-- and the external handles that identify it to a channel. Configuration
-- belongs in progress_checkin_policy, not here.
--
-- See docs/checkin-policy-spec.md.
-- ============================================================================

create table if not exists public.org_directory (
  org_id        uuid primary key default gen_random_uuid(),
  -- ModCon's tenant key — the `<orgKey>` half of its org_settings document ids.
  org_key       text not null,
  -- The organisation's Slack workspace. Null means it does not use Slack, which
  -- is different from "unmapped": an event from an unknown workspace is refused.
  slack_team_id text,
  created_at    timestamptz not null default now()
);

-- Both are joins to something outside this database, so a duplicate splits one
-- organisation in half — half its policy under one org_id, half under another.
create unique index if not exists org_directory_org_key_uniq
  on public.org_directory (lower(org_key));

create unique index if not exists org_directory_slack_team_uniq
  on public.org_directory (slack_team_id)
  where slack_team_id is not null;

comment on table public.org_directory is
  'Tenant identity: ModCon orgKey and the external workspace handles that resolve an inbound message to an organisation.';

-- No foreign key from employees.org_id or goals.org_id to here yet, on purpose.
-- Those columns predate this table and carry org ids from environments that
-- have no row in it; adding the constraint now would fail on existing data and
-- on the SQL suites, which seed organisations directly. The spec records it as
-- the intended target once every org_id has a home.
