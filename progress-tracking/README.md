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
    20260813000100_progress_core.sql     tables, views, RLS, audit trail
    20260813000200_channel_consent.sql   per-channel opt-in, fail-closed for voice
    20260813000300_checkin_dispatch.sql  cadence policy, ask log, escalation
    20260813000400_dispatch_cron.sql     hourly pg_cron schedule
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
test/
  00_supabase_fixture.sql   stand-ins so migrations run on plain Postgres
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

The migration attaches foreign keys to `public.goals` and `public.employees`
**only if those tables exist** — rename in the `do $$ ... $$` blocks at the
bottom of the core migration if yours differ. It expects `goals.owner_id`,
`goals.org_id`, `employees.email` and `employees.slack_user_id`.

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

```bash
node --experimental-strip-types --test test/pure.test.ts      # 18 pass
node --experimental-strip-types --test test/schedule.test.ts  # 16 pass

createdb modcon_test
psql -d modcon_test -f test/00_supabase_fixture.sql
for m in supabase/migrations/2026081300010*.sql supabase/migrations/2026081300020*.sql \
         supabase/migrations/2026081300030*.sql; do psql -d modcon_test -f "$m"; done
psql -d modcon_test -f test/10_behaviour.sql                  # 12 pass
psql -d modcon_test -f test/20_dispatch.sql                   # 12 pass
```

(The cron migration is skipped locally — it needs `pg_cron` and `pg_net`.)

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
