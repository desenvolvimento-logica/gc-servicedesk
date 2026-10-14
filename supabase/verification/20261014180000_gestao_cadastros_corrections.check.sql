-- Read-only verification for 20261014180000_gestao_cadastros_corrections.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. The editor shows only the last result of each block; a failed check
-- raises an error ("... FAILED"), so a block that finishes without error and
-- shows the expected summary passed. Writing blocks are rolled back.
-- Ids and payloads are resolved before impersonating: public.dpto and
-- public.users RLS hide other rows from non-admins.

-- 1. Objects and privileges ---------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'create_request_signatures', (
    select jsonb_agg(oid::regprocedure::text)
    from pg_proc where proname = 'gestao_cadastros_create_request'
  ),
  'anon_can_create_request', has_function_privilege('anon', 'public.gestao_cadastros_create_request(uuid, jsonb, uuid)', 'EXECUTE'),
  'authenticated_can_create_request', has_function_privilege('authenticated', 'public.gestao_cadastros_create_request(uuid, jsonb, uuid)', 'EXECUTE'),
  'new_columns', (
    select jsonb_agg(column_name order by column_name)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'gestao_cadastros_requests'
      and column_name in ('original_operator_id', 'original_operator_name')
  )
));
-- Expected: one signature "gestao_cadastros_create_request(uuid,jsonb,uuid)";
-- anon false; authenticated true; new_columns = ["original_operator_id", "original_operator_name"].

-- 2. Operator: correction rules -----------------------------------------------
begin;
-- Every active text field filled with "Teste" (works whatever fields are active).
select set_config('gc.standard_service', s.id::text, true),
       set_config('gc.standard_values', (
         select jsonb_object_agg(f.field_key, 'Teste')::text from public.gestao_cadastros_service_fields f
         where f.service_id = s.id and f.active and f.field_type in ('text', 'textarea')), true)
from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
where d.dpto_name = 'Fiscal' and s.name = 'Senha gerente';

select set_config('gc.correction_service', s.id::text, true),
       set_config('gc.correction_values', (
         select jsonb_object_agg(f.field_key, 'Teste')::text from public.gestao_cadastros_service_fields f
         where f.service_id = s.id and f.active and f.field_type in ('text', 'textarea')), true)
from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
where d.dpto_name = 'Fiscal' and s.kind = 'correction' and s.active;

select set_config('gc.other_correction_service', s.id::text, true),
       set_config('gc.other_correction_values', (
         select jsonb_object_agg(f.field_key, 'Teste')::text from public.gestao_cadastros_service_fields f
         where f.service_id = s.id and f.active and f.field_type in ('text', 'textarea')), true)
from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
where d.dpto_name = 'Departamento Pessoal' and s.kind = 'correction' and s.active;

select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;

do $$
declare
  v_standard uuid := current_setting('gc.standard_service')::uuid;
  v_standard_values jsonb := current_setting('gc.standard_values')::jsonb;
  v_correction uuid := current_setting('gc.correction_service')::uuid;
  v_values jsonb := current_setting('gc.correction_values')::jsonb;
  v_me bigint := private.gestao_cadastros_current_user_id();
  v_open uuid;
  v_closed uuid;
  v_detail text;
  v_created jsonb;
begin
  v_open := public.gestao_cadastros_create_request(v_standard, v_standard_values) ->> 'id';
  v_closed := public.gestao_cadastros_create_request(v_standard, v_standard_values) ->> 'id';
  perform public.gestao_cadastros_assign_request(v_closed, v_me);
  perform public.gestao_cadastros_change_request_status(v_closed, 'closed');

  begin
    perform public.gestao_cadastros_create_request(v_correction, v_values);
    raise exception 'CORRECTION FAILED: accepted without an original.';
  exception when invalid_parameter_value then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail not like '%original_request_id%' then raise exception 'CORRECTION FAILED: unexpected detail %', v_detail; end if;
  end;

  begin
    perform public.gestao_cadastros_create_request(v_correction, v_values, v_open);
    raise exception 'CORRECTION FAILED: accepted an original that is not closed.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.gestao_cadastros_create_request(
      current_setting('gc.other_correction_service')::uuid,
      current_setting('gc.other_correction_values')::jsonb, v_closed);
    raise exception 'CORRECTION FAILED: accepted an original of another department.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.gestao_cadastros_create_request(v_standard, v_standard_values, v_closed);
    raise exception 'CORRECTION FAILED: a standard request referenced an original.';
  exception when invalid_parameter_value then null;
  end;

  v_created := public.gestao_cadastros_create_request(v_correction, v_values, v_closed);
  perform set_config('gc.correction_id', v_created ->> 'id', true);
  perform set_config('gc.original_id', v_closed::text, true);
end;
$$;

select jsonb_pretty(jsonb_build_object(
  'correction', (
    select jsonb_build_object(
      'kind', r.service_kind,
      'links_original', r.original_request_id = current_setting('gc.original_id')::uuid,
      'original_operator_is_me', r.original_operator_id = private.gestao_cadastros_current_user_id(),
      'original_operator_name', r.original_operator_name)
    from public.gestao_cadastros_requests r where r.id = current_setting('gc.correction_id')::uuid
  ),
  'event_has_original_number', (
    select e.metadata ? 'original_request_number' from public.gestao_cadastros_request_events e
    where e.request_id = current_setting('gc.correction_id')::uuid and e.event_type = 'request_created'
  )
));

reset role;
do $$
begin
  update public.gestao_cadastros_requests set original_request_id = null
  where id = current_setting('gc.correction_id')::uuid;
  raise exception 'GUARD FAILED: the correction link was changed.';
exception when check_violation then null;
end;
$$;
rollback;
-- Expected: kind "correction", links_original true, original_operator_is_me
-- true, original_operator_name = the operator; event_has_original_number true.

-- 3. Requester: only their own closed requests can be corrected ---------------
begin;
select set_config('gc.standard_service', s.id::text, true),
       set_config('gc.standard_values', (
         select jsonb_object_agg(f.field_key, 'Teste')::text from public.gestao_cadastros_service_fields f
         where f.service_id = s.id and f.active and f.field_type in ('text', 'textarea')), true)
from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
where d.dpto_name = 'Fiscal' and s.name = 'Senha gerente';

select set_config('gc.correction_service', s.id::text, true),
       set_config('gc.correction_values', (
         select jsonb_object_agg(f.field_key, 'Teste')::text from public.gestao_cadastros_service_fields f
         where f.service_id = s.id and f.active and f.field_type in ('text', 'textarea')), true)
from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
where d.dpto_name = 'Fiscal' and s.kind = 'correction' and s.active;

-- The operator opens and closes a request (not the requester's).
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;
select set_config('gc.others_request',
  public.gestao_cadastros_create_request(current_setting('gc.standard_service')::uuid,
    current_setting('gc.standard_values')::jsonb) ->> 'id', true);
select public.gestao_cadastros_change_request_status(current_setting('gc.others_request')::uuid, 'closed');

reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;

do $$
declare
  v_own uuid;
begin
  begin
    perform public.gestao_cadastros_create_request(current_setting('gc.correction_service')::uuid,
      current_setting('gc.correction_values')::jsonb, current_setting('gc.others_request')::uuid);
    raise exception 'AUTH FAILED: requester corrected another user''s request.';
  exception when invalid_parameter_value then null;
  end;

  -- Own request, still open: rejected too.
  v_own := public.gestao_cadastros_create_request(current_setting('gc.standard_service')::uuid,
    current_setting('gc.standard_values')::jsonb) ->> 'id';
  begin
    perform public.gestao_cadastros_create_request(current_setting('gc.correction_service')::uuid,
      current_setting('gc.correction_values')::jsonb, v_own);
    raise exception 'CORRECTION FAILED: requester corrected an open request.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

select 'OK: requester rules hold' as result;
rollback;
-- Expected: "OK: requester rules hold".
-- (If no Fiscal user has logged in yet, the requester steps do not apply.)
