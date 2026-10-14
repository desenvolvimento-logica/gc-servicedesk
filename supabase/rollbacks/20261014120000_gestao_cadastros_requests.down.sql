-- Rollback for 20261014120000_gestao_cadastros_requests.sql
-- Removes ONLY the objects created by that migration. Shared tables are untouched.
-- Run in the Supabase SQL Editor only if the migration must be undone; it
-- refuses to run once any request exists (request history is permanent).

begin;

do $$
begin
  if exists (select 1 from public.gestao_cadastros_requests) then
    raise exception 'Requests already exist; the requests migration cannot be rolled back.';
  end if;
end;
$$;

drop function if exists public.gestao_cadastros_create_request(uuid, jsonb);

drop table if exists public.gestao_cadastros_request_events;
drop table if exists public.gestao_cadastros_request_values;
drop table if exists public.gestao_cadastros_requests;
drop table if exists public.gestao_cadastros_request_counters;

drop function if exists private.gestao_cadastros_can_read_request(uuid);
drop function if exists private.gestao_cadastros_reject_change();
drop function if exists private.gestao_cadastros_guard_request_update();

drop type if exists public.gestao_cadastros_event_visibility;
drop type if exists public.gestao_cadastros_request_event_type;
drop type if exists public.gestao_cadastros_request_status;

commit;
