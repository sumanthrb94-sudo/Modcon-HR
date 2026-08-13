-- ============================================================================
-- Resolve a ModCon tenant key to this subsystem's organisation id, creating the
-- row the first time that tenant configures anything.
--
-- Creation lives here rather than in the edge function so that "which uuid is
-- this tenant" has exactly one answer, arrived at the same way whoever asks.
-- ============================================================================

create or replace function public.org_id_for_key(p_org_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if p_org_key is null or btrim(p_org_key) = '' then
    raise exception 'org key is required';
  end if;

  select org_id into found
    from public.org_directory
   where lower(org_key) = lower(btrim(p_org_key));

  if found is not null then
    return found;
  end if;

  insert into public.org_directory (org_key)
  values (btrim(p_org_key))
  on conflict do nothing
  returning org_id into found;

  -- A concurrent caller may have won the insert; the unique index makes that
  -- safe, and re-reading is how this stays idempotent rather than erroring.
  if found is null then
    select org_id into found
      from public.org_directory
     where lower(org_key) = lower(btrim(p_org_key));
  end if;

  return found;
end;
$$;

comment on function public.org_id_for_key(text) is
  'The one way a ModCon tenant key becomes an org_id. Creates the directory row on first use; idempotent under concurrency.';
