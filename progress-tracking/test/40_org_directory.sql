-- ============================================================================
-- Resolving a ModCon tenant key to one organisation.
--
-- The tenant key is the join between two databases that share no ids, so the
-- two properties that matter are that it always answers the same, and that two
-- tenants never collapse into one.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

do $$
declare first_id uuid; second_id uuid;
begin
  first_id  := public.org_id_for_key('Acme');
  second_id := public.org_id_for_key('acme');
  if first_id is null then
    raise exception 'TEST 1 FAILED — no org_id returned';
  end if;
  if first_id <> second_id then
    raise exception 'TEST 1 FAILED — case variants produced two organisations: % and %', first_id, second_id;
  end if;
  raise notice 'TEST 1 ok — a tenant key resolves to one organisation regardless of case';
end $$;

do $$
declare a uuid; b uuid;
begin
  a := public.org_id_for_key('one');
  b := public.org_id_for_key('two');
  if a = b then
    raise exception 'TEST 2 FAILED — two tenant keys resolved to the same organisation';
  end if;
  raise notice 'TEST 2 ok — different tenant keys are different organisations';
end $$;

rollback;
