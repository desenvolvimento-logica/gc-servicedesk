-- Rollback for 20261014150000_gestao_cadastros_request_workflow.sql
-- Removes ONLY the objects created by that migration and restores the Phase 4
-- request guard. Shared tables are untouched.
-- Refuses to run once the workflow has been used (history is permanent).

begin;

do $$
begin
  if exists (select 1 from public.gestao_cadastros_request_events where event_type <> 'request_created')
     or exists (select 1 from public.gestao_cadastros_requests where status <> 'open' or assigned_to is not null) then
    raise exception 'The workflow was already used; it cannot be rolled back.';
  end if;
end;
$$;

drop function if exists public.gestao_cadastros_add_internal_note(uuid, text);
drop function if exists public.gestao_cadastros_change_request_status(uuid, public.gestao_cadastros_request_status);
drop function if exists public.gestao_cadastros_assign_request(uuid, bigint);
drop function if exists public.gestao_cadastros_operators();
drop function if exists private.gestao_cadastros_lock_open_request(uuid);
drop function if exists private.gestao_cadastros_user_name(bigint);

drop index if exists public.gestao_cadastros_requests_closed_by_idx;
alter table public.gestao_cadastros_requests
  drop constraint if exists gestao_cadastros_requests_assigned_name_check,
  drop constraint if exists gestao_cadastros_requests_closed_by_check,
  drop column if exists closed_by_name,
  drop column if exists closed_by,
  drop column if exists assigned_to_name;

-- Phase 4 version of the guard.
create or replace function private.gestao_cadastros_guard_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.request_number      is distinct from old.request_number
     or new.service_id       is distinct from old.service_id
     or new.service_name     is distinct from old.service_name
     or new.service_kind     is distinct from old.service_kind
     or new.dpto_id          is distinct from old.dpto_id
     or new.dpto_name        is distinct from old.dpto_name
     or new.requester_id     is distinct from old.requester_id
     or new.requester_name   is distinct from old.requester_name
     or new.requester_email  is distinct from old.requester_email
     or new.requester_dpto_id   is distinct from old.requester_dpto_id
     or new.requester_dpto_name is distinct from old.requester_dpto_name
     or new.company_name     is distinct from old.company_name
     or new.company_code     is distinct from old.company_code
     or new.original_request_id is distinct from old.original_request_id
     or new.opened_at        is distinct from old.opened_at then
    raise exception 'Submitted request data cannot be changed.'
      using errcode = 'check_violation';
  end if;
  if old.status = 'closed' then
    raise exception 'A closed request cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

commit;
