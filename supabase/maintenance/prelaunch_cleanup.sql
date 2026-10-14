-- =============================================================================
-- GC Service Desk — ONE-TIME pre-launch cleanup of test requests
--
-- NOT a migration. Run once, right before the system is released for real
-- use, only with explicit approval. After launch, never run it again:
-- request history is permanent (the guard triggers exist for that reason).
--
-- Choose the mode on the line marked "MODE" (inside the block below):
--   'e2e' — deletes only requests marked by the automated tests (company
--           "TESTE E2E"), plus any correction chain built on them.
--   'all' — deletes EVERY request, value and event, and restarts the request
--           numbering (the first real request becomes GC-<year>-000001).
--
-- Catalog, roles and requester departments are not touched.
--
-- How it works (one DO block = one transaction; any error undoes everything):
--   1. temporarily disables the "no delete / append-only" guard triggers,
--   2. deletes events, values and requests (corrections before originals),
--   3. re-enables the triggers and checks they are enabled again.
-- Run the whole file in the Supabase SQL Editor (as the project owner).
-- =============================================================================

-- One statement on purpose: the SQL Editor may not keep a session between
-- statements, so the mode cannot be carried in a temporary table.
do $$
declare
  v_mode constant text := 'e2e';   -- MODE: 'e2e' or 'all'
  v_ids uuid[];
  v_requests integer;
  v_values integer;
  v_events integer;
begin
  if v_mode not in ('e2e', 'all') then
    raise exception 'Invalid mode %: use e2e or all.', v_mode;
  end if;

  -- Requests to delete: the base set plus every correction that (directly or
  -- through other corrections) references one of them.
  with recursive targets as (
    select r.id
    from public.gestao_cadastros_requests r
    where v_mode = 'all' or r.company_name = 'TESTE E2E'
    union
    select c.id
    from public.gestao_cadastros_requests c
    join targets t on c.original_request_id = t.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from targets;

  alter table public.gestao_cadastros_requests disable trigger gestao_cadastros_requests_no_delete;
  alter table public.gestao_cadastros_request_values disable trigger gestao_cadastros_request_values_append_only;
  alter table public.gestao_cadastros_request_events disable trigger gestao_cadastros_request_events_append_only;

  delete from public.gestao_cadastros_request_events where request_id = any (v_ids);
  get diagnostics v_events = row_count;
  delete from public.gestao_cadastros_request_values where request_id = any (v_ids);
  get diagnostics v_values = row_count;

  -- Corrections first (self-reference is ON DELETE RESTRICT), deepest first.
  loop
    delete from public.gestao_cadastros_requests r
    where r.id = any (v_ids)
      and not exists (
        select 1 from public.gestao_cadastros_requests c
        where c.original_request_id = r.id
      );
    exit when not found;
  end loop;

  select count(*) into v_requests from unnest(v_ids);
  if exists (select 1 from public.gestao_cadastros_requests where id = any (v_ids)) then
    raise exception 'Some selected requests could not be deleted (referenced by requests outside the selection).';
  end if;

  if v_mode = 'all' then
    delete from public.gestao_cadastros_request_counters;
  end if;

  alter table public.gestao_cadastros_requests enable trigger gestao_cadastros_requests_no_delete;
  alter table public.gestao_cadastros_request_values enable trigger gestao_cadastros_request_values_append_only;
  alter table public.gestao_cadastros_request_events enable trigger gestao_cadastros_request_events_append_only;

  if exists (
    select 1 from pg_trigger
    where tgname in ('gestao_cadastros_requests_no_delete',
                     'gestao_cadastros_request_values_append_only',
                     'gestao_cadastros_request_events_append_only')
      and tgenabled = 'D'
  ) then
    raise exception 'Guard triggers were not re-enabled.';
  end if;

  raise notice 'Mode %: deleted % requests, % values, % events.', v_mode, v_requests, v_values, v_events;
end;
$$;

-- Result (run this select again at any time; it only reads).
select jsonb_pretty(jsonb_build_object(
  'remaining_requests', (select count(*) from public.gestao_cadastros_requests),
  'remaining_e2e_requests', (select count(*) from public.gestao_cadastros_requests where company_name = 'TESTE E2E'),
  'counters', (select coalesce(jsonb_object_agg(year, last_value), '{}'::jsonb) from public.gestao_cadastros_request_counters),
  'guard_triggers_enabled', (
    select bool_and(tgenabled <> 'D') from pg_trigger
    where tgname in ('gestao_cadastros_requests_no_delete',
                     'gestao_cadastros_request_values_append_only',
                     'gestao_cadastros_request_events_append_only')
  )
));
-- Expected ('e2e'): remaining_e2e_requests = 0; guard_triggers_enabled true.
-- Expected ('all'): remaining_requests = 0; counters = {}; guard_triggers_enabled true.
