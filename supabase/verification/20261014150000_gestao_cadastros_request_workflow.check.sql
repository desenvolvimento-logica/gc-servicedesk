-- Read-only verification for 20261014150000_gestao_cadastros_request_workflow.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. The editor shows only the last result of each block; a failed check
-- raises an error ("... FAILED"), so a block that finishes without error and
-- shows the expected summary passed. Writing blocks are rolled back.

-- 1. Objects and privileges ---------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'new_columns', (
    select jsonb_agg(column_name order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'gestao_cadastros_requests'
      and column_name in ('assigned_to_name', 'closed_by', 'closed_by_name')
  ),
  'anon_can_execute', (
    select jsonb_agg(f)
    from unnest(array[
      'public.gestao_cadastros_operators()',
      'public.gestao_cadastros_assign_request(uuid, bigint)',
      'public.gestao_cadastros_change_request_status(uuid, public.gestao_cadastros_request_status)',
      'public.gestao_cadastros_add_internal_note(uuid, text)'
    ]) f
    where has_function_privilege('anon', f, 'EXECUTE')
  ),
  'authenticated_can_execute_private_helpers', (
    has_function_privilege('authenticated', 'private.gestao_cadastros_lock_open_request(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.gestao_cadastros_user_name(bigint)', 'EXECUTE')
  ),
  'authenticated_write_privileges_on_requests', (
    select jsonb_agg(p) from unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('authenticated', 'public.gestao_cadastros_requests', p)
  )
));
-- Expected: new_columns = ["assigned_to_name", "closed_by", "closed_by_name"];
-- anon_can_execute = null; authenticated_can_execute_private_helpers = false;
-- authenticated_write_privileges_on_requests = null.

-- 2. Operator: full workflow on a new request ----------------------------------
begin;
-- Resolved before impersonating: public.dpto/public.users RLS hide other rows
-- from non-admins.
select set_config('gc.service_id', s.id::text, true)
from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
where d.dpto_name = 'Fiscal' and s.name = 'Senha gerente';

-- Any corporate user without an active operator role.
select set_config('gc.non_operator_id', u.user_id::text, true)
from public.users u
where not exists (
  select 1 from public.gestao_cadastros_user_roles r
  where r.user_id = u.user_id and r.role = 'operator' and r.active
)
order by u.user_id
limit 1;

select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;

select set_config('gc.request_id', (public.gestao_cadastros_create_request(
  current_setting('gc.service_id')::uuid,
  jsonb_build_object('nome_empresa', 'Empresa Teste', 'codigo_empresa', '0001')
) ->> 'id'), true);

do $$
declare
  v_request uuid := current_setting('gc.request_id')::uuid;
  v_me bigint := private.gestao_cadastros_current_user_id();
  v_non_operator bigint := nullif(current_setting('gc.non_operator_id', true), '')::bigint;
begin
  if v_non_operator is null then raise exception 'SETUP FAILED: no non-operator user found.'; end if;

  perform 1 from public.gestao_cadastros_operators() o where o.user_id = v_me;
  if not found then raise exception 'OPERATORS FAILED: caller is not listed.'; end if;

  begin
    perform public.gestao_cadastros_assign_request(v_request, v_non_operator);
    raise exception 'ASSIGN FAILED: a non-operator was accepted.';
  exception when invalid_parameter_value then null;
  end;

  perform public.gestao_cadastros_assign_request(v_request, v_me);
  perform public.gestao_cadastros_assign_request(v_request, v_me); -- no-op, no event
  perform public.gestao_cadastros_change_request_status(v_request, 'in_progress');

  begin
    perform public.gestao_cadastros_change_request_status(v_request, 'open');
    raise exception 'STATUS FAILED: request returned to open.';
  exception when object_not_in_prerequisite_state then null;
  end;

  perform public.gestao_cadastros_add_internal_note(v_request, '  Nota de teste  ');

  begin
    perform public.gestao_cadastros_add_internal_note(v_request, '   ');
    raise exception 'NOTE FAILED: an empty note was accepted.';
  exception when invalid_parameter_value then null;
  end;

  perform public.gestao_cadastros_change_request_status(v_request, 'closed');

  begin
    perform public.gestao_cadastros_assign_request(v_request, null);
    raise exception 'CLOSED FAILED: a closed request was changed.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select jsonb_pretty(jsonb_build_object(
  'request', (
    select jsonb_build_object(
      'status', r.status,
      'assigned_to_name', r.assigned_to_name,
      'closed_by_is_me', r.closed_by = private.gestao_cadastros_current_user_id(),
      'completed', r.completed_at is not null)
    from public.gestao_cadastros_requests r where r.id = current_setting('gc.request_id')::uuid
  ),
  'events', (
    select jsonb_agg(e.event_type || ' (' || e.visibility || ')' order by e.id)
    from public.gestao_cadastros_request_events e where e.request_id = current_setting('gc.request_id')::uuid
  ),
  'note', (
    select e.new_value ->> 'text' from public.gestao_cadastros_request_events e
    where e.request_id = current_setting('gc.request_id')::uuid and e.event_type = 'internal_note_added'
  )
));
rollback;
-- Expected: status "closed", assigned_to_name = the operator, closed_by_is_me
-- true, completed true; events = request_created (requester), assigned
-- (requester), status_changed (requester), internal_note_added (internal),
-- request_closed (requester); note = "Nota de teste".

-- 3. Requester: no staff actions, no internal notes -----------------------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;

select set_config('gc.request_id', (public.gestao_cadastros_create_request(
  (select s.id from public.gestao_cadastros_services s where s.name = 'Senha gerente'),
  jsonb_build_object('nome_empresa', 'Minha', 'codigo_empresa', '3')
) ->> 'id'), true);

do $$
declare
  v_request uuid := current_setting('gc.request_id')::uuid;
begin
  begin
    perform public.gestao_cadastros_change_request_status(v_request, 'closed');
    raise exception 'AUTH FAILED: requester closed a request.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gestao_cadastros_operators();
    raise exception 'AUTH FAILED: requester listed operators.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- An operator adds a note and starts the request.
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;
select public.gestao_cadastros_add_internal_note(current_setting('gc.request_id')::uuid, 'Interna');
select public.gestao_cadastros_change_request_status(current_setting('gc.request_id')::uuid, 'in_progress');

-- Back to the requester.
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;

select jsonb_pretty(jsonb_build_object(
  'requester_sees_status', (select status from public.gestao_cadastros_requests where id = current_setting('gc.request_id')::uuid),
  'requester_sees_events', (
    select jsonb_agg(event_type order by id) from public.gestao_cadastros_request_events
    where request_id = current_setting('gc.request_id')::uuid
  )
));
rollback;
-- Expected: requester_sees_status "in_progress"; requester_sees_events =
-- ["request_created", "status_changed"] (the internal note is hidden).
