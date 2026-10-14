-- Read-only verification for 20261015090000_gestao_cadastros_reports.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. The editor shows only the last result of each block; a failed check
-- raises an error ("... FAILED"), so a block that finishes without error and
-- shows the expected summary passed. Writing blocks are rolled back.
-- Real requests may already exist today, so block 2 compares before/after.

-- 1. Objects and privileges ---------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'indexes', (
    select jsonb_agg(indexname order by indexname) from pg_indexes
    where tablename = 'gestao_cadastros_requests'
      and indexname in ('gestao_cadastros_requests_opened_idx', 'gestao_cadastros_requests_service_opened_idx',
                        'gestao_cadastros_requests_service_idx')
  ),
  'anon_can_execute', (
    has_function_privilege('anon', 'public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind)', 'EXECUTE')
    or has_function_privilege('anon', 'public.gestao_cadastros_report_requests(date, date, bigint, uuid, public.gestao_cadastros_service_kind, boolean, integer, integer)', 'EXECUTE')
  ),
  'authenticated_can_execute', (
    has_function_privilege('authenticated', 'public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.gestao_cadastros_report_requests(date, date, bigint, uuid, public.gestao_cadastros_service_kind, boolean, integer, integer)', 'EXECUTE')
  )
));
-- Expected: indexes = ["gestao_cadastros_requests_opened_idx",
-- "gestao_cadastros_requests_service_opened_idx"] (service_idx removed);
-- anon_can_execute false; authenticated_can_execute true.

-- 2. Operator: indicators and export rows reflect new requests -----------------
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

select set_config('gc.today', (now() at time zone 'America/Sao_Paulo')::date::text, true);

select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;

do $$
declare
  v_today date := current_setting('gc.today')::date;
  v_before jsonb := public.gestao_cadastros_report_summary(v_today, v_today);
  v_after jsonb;
  v_open uuid;
  v_closed uuid;
  v_correction uuid;
  v_row record;
begin
  v_open := public.gestao_cadastros_create_request(current_setting('gc.standard_service')::uuid,
    current_setting('gc.standard_values')::jsonb) ->> 'id';
  v_closed := public.gestao_cadastros_create_request(current_setting('gc.standard_service')::uuid,
    current_setting('gc.standard_values')::jsonb) ->> 'id';
  perform public.gestao_cadastros_assign_request(v_closed, private.gestao_cadastros_current_user_id());
  perform public.gestao_cadastros_change_request_status(v_closed, 'closed');
  v_correction := public.gestao_cadastros_create_request(current_setting('gc.correction_service')::uuid,
    current_setting('gc.correction_values')::jsonb, v_closed) ->> 'id';

  v_after := public.gestao_cadastros_report_summary(v_today, v_today);

  if (v_after ->> 'total')::int - (v_before ->> 'total')::int <> 3 then
    raise exception 'SUMMARY FAILED: total delta %', (v_after ->> 'total')::int - (v_before ->> 'total')::int;
  end if;
  if (v_after #>> '{by_status,closed}')::int - (v_before #>> '{by_status,closed}')::int <> 1 then
    raise exception 'SUMMARY FAILED: closed delta';
  end if;
  if (v_after #>> '{rework,corrections}')::int - (v_before #>> '{rework,corrections}')::int <> 1 then
    raise exception 'SUMMARY FAILED: corrections delta';
  end if;
  if v_after -> 'avg_resolution_hours' = 'null'::jsonb then
    raise exception 'SUMMARY FAILED: no resolution time';
  end if;

  -- Correction service only, with values: the new correction is there with its fields.
  select * into v_row
  from public.gestao_cadastros_report_requests(v_today, v_today, null,
         current_setting('gc.correction_service')::uuid, null, true, 0, 1000) r
  where r.id = v_correction;
  if not found then raise exception 'EXPORT FAILED: correction row missing.'; end if;
  if jsonb_array_length(v_row.field_values) = 0 then raise exception 'EXPORT FAILED: no field values.'; end if;
  if v_row.original_request_number is null then raise exception 'EXPORT FAILED: original number missing.'; end if;

  -- Without values, field_values is null.
  select * into v_row
  from public.gestao_cadastros_report_requests(v_today, v_today) r where r.id = v_open;
  if v_row.field_values is not null then raise exception 'EXPORT FAILED: values returned when not requested.'; end if;

  begin
    perform public.gestao_cadastros_report_summary(v_today, v_today - 1);
    raise exception 'PERIOD FAILED: inverted period accepted.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

select 'OK: indicators and export rows' as result;
rollback;
-- Expected: "OK: indicators and export rows".

-- 3. Requester: no access to reports ------------------------------------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;
do $$
begin
  begin
    perform public.gestao_cadastros_report_summary(current_date - 30, current_date);
    raise exception 'AUTH FAILED: requester read the report summary.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.gestao_cadastros_report_requests(current_date - 30, current_date);
    raise exception 'AUTH FAILED: requester read export rows.';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select 'OK: requester denied' as result;
rollback;
-- Expected: "OK: requester denied".
