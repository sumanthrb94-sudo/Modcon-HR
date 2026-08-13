# ModCon HR — live progress tracking

Multi-channel progress capture for the Performance page. Voice check-ins, chat,
email replies and the in-app form all land in **one append-only event table**;
a goal's current progress is derived from the latest applied event, never
written directly.

```
                    ┌──────────────── dispatcher (hourly) ────────────────┐
                    │  who is overdue → which channel → is it a civil hour │
                    └───────────────────────┬─────────────────────────────┘
                                            ▼  asks
call ──┐
chat ──┤
email ─┼──► ingest adapter ──► extraction ──► confidence gate ──┬─► applied ──► dashboard
app  ──┘   (verify + route)    (LLM)          (deterministic)   └─► needs_review ──► manager queue
                                            │
                                            └─► answer closes the open ask
```

## What's here

```
supabase/
  migrations/
    20260813000050_base_schema.sql       goals + employees, additive on an existing project
    20260813000100_progress_core.sql     tables, views, RLS, audit trail
    20260813000200_channel_consent.sql   per-channel opt-in, fail-closed for voice
    20260813000300_checkin_dispatch.sql  cadence policy, ask log, escalation
    20260813000400_dispatch_cron.sql     hourly pg_cron schedule
    20260813000500_base_schema_rls.sql   RLS on the two base tables (only if it created them)
  functions/
    _shared/types.ts     shared contracts
    _shared/http.ts      CORS, HMAC, constant-time secret compare
    _shared/parse.ts     slash command, email quote stripping, uuid guard  (pure)
    _shared/gate.ts      confidence guardrails                             (pure)
    _shared/schedule.ts  quiet hours, escalation, prompt copy              (pure)
    _shared/senders.ts   Resend / Slack / outbound-call adapters
    _shared/ingest.ts    candidate lookup, model call, insert
    extract-progress/    generic HTTP entry point
    ingest-voice/        post-call webhook  (consent-gated)
    ingest-slack/        events + /progress slash command
    ingest-email/        inbound reply webhook
    dispatch-checkins/   the scheduler
types/
  deno.d.ts                 the Deno globals the functions use (env, serve)
  remote-modules.d.ts       shim for the one https:// import
tsconfig.json               `npm run typecheck:progress`
test/
  00_supabase_fixture.sql   roles + auth.uid() so migrations run on plain Postgres
  10_behaviour.sql          12 schema/RLS invariant checks
  20_dispatch.sql           12 dispatcher invariant checks
  pure.test.ts              18 unit tests for gate + parsers
  schedule.test.ts          16 unit tests for quiet hours + escalation
```

## Apply

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy extract-progress ingest-voice ingest-slack ingest-email dispatch-checkins

# then point the cron job at the deployed function
psql "$DATABASE_URL" -c "alter database postgres set app.dispatch_url = 'https://<ref>.supabase.co/functions/v1/dispatch-checkins'"
psql "$DATABASE_URL" -c "alter database postgres set app.dispatch_secret = '<DISPATCH_SHARED_SECRET>'"
```

### The two tables it sits on

`goals` and `employees` are supplied by `20260813000050_base_schema.sql`, so a
fresh project comes up working. On a project that already has either table the
migration is additive rather than assertive: `create table if not exists` leaves
yours alone, and `add column if not exists` adds only the columns the edge
functions select by name — all nullable, so nothing needs backfilling.

The columns that matter: `goals.owner_id`, `goals.org_id`, `goals.title`,
`goals.status` (only `'active'` is chased), and `employees.email`,
`employees.slack_user_id`, `employees.phone`, `employees.full_name`.

Two uniqueness constraints are load-bearing rather than tidy. `ingest-email`
resolves the sender with `.ilike(email).maybeSingle()` and `ingest-slack` with
`.eq(slack_user_id).maybeSingle()`; `maybeSingle()` **errors on a second row**,
that error resolves the employee to null, and the reply is then dropped with no
record of why. Hence a unique index on `lower(email)` and on `slack_user_id`.

`20260813000500_base_schema_rls.sql` puts row-level security on those two tables
— your own record and your own goals, plus the whole organisation for a
`manager`/`hr_admin`/`owner`. It applies **only to tables the base migration
itself created**, tracked in `progress_base_schema_owned`. Enabling RLS on a
table a project already had would deny every read its application makes the
moment the migration lands, and a table left open because only the service role
touches it looks, afterwards, exactly like one that was waiting for policies.

If your tables are named differently, set `GOALS_TABLE` / `EMPLOYEES_TABLE` in
the function environment and skip `000050` — the later migrations attach their
foreign keys conditionally and apply cleanly without it.

### JWT claims

RLS reads `org_id`, `employee_id` and `hr_role` from the access token. Add a
custom access token hook that stamps them, or the policies deny everything.
`hr_role` in `manager | hr_admin | owner` grants org-wide visibility.

### Secrets

```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  EXTRACTION_MODEL=claude-sonnet-4-5 \
  AUTO_APPLY_CONFIDENCE=0.8 \
  INGEST_SHARED_SECRET=$(openssl rand -hex 32) \
  ELEVENLABS_WEBHOOK_SECRET=... \
  SLACK_SIGNING_SECRET=... \
  RESEND_WEBHOOK_SECRET=whsec_... \
  DISPATCH_SHARED_SECRET=$(openssl rand -hex 32) \
  RESEND_API_KEY=re_... \
  SLACK_BOT_TOKEN=xoxb-... \
  CHECKIN_FROM_EMAIL="ModCon HR <hr@modcon-hr.com>" \
  UPDATES_EMAIL_DOMAIN=updates.modcon-hr.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## The confidence gate

The model self-reports confidence; these rules override it downward, and they
are the reason the dashboard stays trustworthy:

| Situation | Effect |
|---|---|
| No percentage actually stated | capped at 0.6 → review |
| Goal inferred among several | capped at 0.75 |
| Drop of more than 20 points | capped at 0.5 (usually a misparse) |
| Marked done / 100% | always below threshold — a human signs off |
| No goal resolved, or no signal | straight to review, confidence 0 |

Tune with `AUTO_APPLY_CONFIDENCE`. Start at **0.9** for the first two weeks so
almost everything passes a human, then lower it once the queue is boring.

## Wiring each channel

**Voice.** Place the call with `org_id`, `employee_id` and (ideally) `goal_id`
as dynamic variables, point the post-call webhook at `/ingest-voice`. Without a
`progress_channel_consent` row for `call`, the transcript is discarded — that is
deliberate. Recording URLs are never stored, only the transcript.

**Slack.** Request URL `/ingest-slack` for both the Events API (`message.channels`,
`message.groups`) and the `/progress` slash command. Only threaded replies count,
so ordinary channel chatter is never ingested. Slash commands with a real goal id
skip the model entirely.

**Email.** Send the check-in with reply-to `goal+<goal_id>@updates.yourdomain.com`
and point the Resend inbound webhook at `/ingest-email`. Quoted history is
stripped before extraction.

**In-app.** POST to `/extract-progress` with `source: "app"`, or insert directly
from the client — the RLS insert policy allows employees to file their own
`app` events at full confidence.

## The dispatcher

Nothing about cadence lives in code. `progress_checkin_policy` holds it, and
the most specific scope wins — **goal > employee > org default**:

```sql
-- org default: weekly, gentlest channel first
insert into progress_checkin_policy (org_id, cadence_days, channel_ladder)
values ($1, 7, '{app,chat,email}');

-- one goal that matters more, and may be chased by phone
insert into progress_checkin_policy (org_id, goal_id, cadence_days, channel_ladder, escalate_after_days)
values ($1, $2, 3, '{chat,email,call}', 2);
```

Hourly, `dispatch-checkins`:

1. **Escalates** asks nobody answered — down one rung after `escalate_after_days`,
   and at the bottom of the ladder it gives up rather than nagging forever.
2. **Claims** newly due goals through `claim_due_checkins()`, which inserts
   against a partial unique index. Two dispatchers racing cannot double-send.
3. **Sends**, unless it is quiet hours in *the employee's* timezone, a weekend,
   or a voice ask without consent — in which case it defers or skips.
4. **Records** the outcome and the external reference, so the reply threads back.

An answer on **any** channel closes the open ask; a trigger does it, so asking
on Slack and being answered by email works without special handling. Approving
something from the review queue closes it too.

Watch a cycle before it messages anyone:

```bash
curl -X POST "$FUNCTIONS_URL/dispatch-checkins" \
  -H "x-webhook-secret: $DISPATCH_SHARED_SECRET" \
  -H "content-type: application/json" \
  -d '{"dry_run": true}'
```

Pause it entirely with `select cron.unschedule('modcon-checkin-dispatch');`.

Defaults worth revisiting for your own team: quiet hours 19:00–09:00
`Asia/Kolkata`, weekends skipped (`DISPATCH_SKIP_WEEKENDS=false` to change),
`app` first on the ladder so the gentlest ask happens before anyone's phone buzzes.

## Reading it back

```sql
-- the four tiles
select * from org_progress_rollup where org_id = $1;

-- goal cards, with freshness
select * from goal_progress_health where org_id = $1 order by days_since_update desc;

-- the review queue
select * from progress_update where org_id = $1 and state = 'needs_review' order by created_at desc;

-- one goal's history → sparkline
select occurred_at, percent, source from progress_update
where goal_id = $1 and state = 'applied' order by occurred_at;
```

`progress_update` is in the `supabase_realtime` publication, so the activity
feed is a subscription rather than a poll.

## Tests

From the repository root:

```bash
npm run typecheck:progress   # tsc over the edge functions and their tests
npm run test:progress        # 34 pass (18 gate/parsers + 16 quiet hours/escalation)
```

From this directory, the schema suites:

```bash
createdb modcon_test
psql -d modcon_test -f test/00_supabase_fixture.sql
for m in supabase/migrations/*.sql; do
  case "$m" in *dispatch_cron*) continue;; esac      # needs pg_cron + pg_net
  psql -v ON_ERROR_STOP=1 -d modcon_test -f "$m"
done
psql -d modcon_test -f test/10_behaviour.sql                  # 12 pass
psql -d modcon_test -f test/20_dispatch.sql                   # 12 pass
```

Apply them in filename order — `000050` creates the two tables the rest attach
to, and `000500` needs the `jwt_*` helpers `000100` defines. The fixture no
longer declares `goals`/`employees` itself: a second definition is how it came
to be missing `employees.phone`, which `dispatch-checkins` selects by name, so
the suites passed against a shape the deployed schema did not have.

**Both SQL suites seed fixed uuids, so they run once per database.** A second
run against the same database fails on `employees_pkey` rather than reporting a
regression. `dropdb modcon_test && createdb modcon_test` between runs.

**pgcrypto is requested but not required.** `gen_random_uuid()` is the only
thing these migrations wanted it for and it has been in core since PostgreSQL
13, so the `create extension` is wrapped in an exception block: a server that
does not package pgcrypto logs a notice instead of failing the migration.
Supabase has it; stripped and embedded builds often do not.

### What the type-check does and does not prove

`tsc -p progress-tracking` is deliberately **not** part of the app's `tsc -b`.
The root build emits the React bundle; these are Deno modules with URL imports,
and folding them in would make a broken edge function fail the app's deploy.

Green means our own code is internally consistent. It does **not** verify the
remote supabase-js API — `types/remote-modules.d.ts` is a hand-written shim and
row data is `any` on purpose — nor that any column exists in Postgres. The SQL
suites are what cover the schema. Bumping the supabase-js version in the import
without bumping it in the shim reports the module as missing, which is intended.

**Schema suite:** derived progress, staleness, rollup arithmetic, the append-only
guard, the audit trail, duplicate webhook rejection, signal-free chatter, consent
grant/revoke, four RLS boundaries.

**Dispatch suite:** policy resolution across all three scopes, due detection,
atomic claiming under a second run, ladder-head selection, cross-channel answer
closing, review-approval closing, three-step escalation then give-up, early
escalation refusal, no-second-ask-while-open, finished goals left alone, check-in
privacy.

**Unit suites:** the confidence gate's five downgrade rules, slash-command
parsing, email quote stripping, uuid guarding, quiet hours across midnight and
timezones, weekend detection in local time, and the prompt copy.

## Design notes worth keeping

- **Append-only.** `percent`, `raw_text` and `source` are immutable after insert;
  a trigger enforces it. Corrections are new events, not edits. Employees keep
  their own history and managers cannot quietly rewrite a number.
- **Every employee can read their own events.** This is what separates goal
  tracking from surveillance, and it is why the audit table exists.
- **Idempotent by construction.** `(source, source_ref)` is unique, so webhook
  retries are free.
- **Freshness is the real signal.** "Last update 9 days ago" tells a manager
  more than "60%". The health view leads with it.
- **Asking is logged too.** `progress_checkin` is visible to the person asked,
  so nobody is pinged invisibly, and the ladder gives up instead of nagging.
- **Cadence is configuration.** Changing how often people get chased is an
  UPDATE, not a deploy.

## Where to take it next

- **Review queue UI** — the data is there (`state = 'needs_review'`, with
  `review_reason` explaining the downgrade); it needs a screen.
- **Per-employee channel preference** — the ladder is per-policy today. A
  `preferred_channel` on the employee record would let people opt into voice
  and out of Slack.
- **Cadence by goal health** — chase an at-risk goal weekly and a healthy one
  fortnightly, by making `cadence_days` a function of `health`.
