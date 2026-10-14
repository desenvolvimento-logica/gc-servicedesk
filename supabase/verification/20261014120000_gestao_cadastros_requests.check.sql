-- Read-only verification for 20261014120000_gestao_cadastros_requests.sql
-- Run in the Supabase SQL Editor after applying the migration. The editor
-- shows only the last result of each block; a failed check raises an error
-- ("... FAILED"), so a block that finishes without error passed its guards.
-- Blocks that write run inside a transaction that is rolled back (request
-- numbers consumed there are rolled back too), impersonating a user through
-- the same JWT claim Supabase sets on API requests.

-- 1. Objects, RLS and privileges --------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'rls_enabled', (
    select jsonb_object_agg(c.relname, c.relrowsecurity)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('gestao_cadastros_requests', 'gestao_cadastros_request_values',
                        'gestao_cadastros_request_events', 'gestao_cadastros_request_counters')
      and c.relkind = 'r'
  ),
  'policies', (
    select jsonb_agg(tablename || ' [' || cmd || '] ' || policyname order by tablename, cmd)
    from pg_policies
    where tablename in ('gestao_cadastros_requests', 'gestao_cadastros_request_values',
                        'gestao_cadastros_request_events', 'gestao_cadastros_request_counters')
  ),
  'authenticated_write_privileges', (
    select jsonb_agg(t || ':' || p)
    from unnest(array['gestao_cadastros_requests', 'gestao_cadastros_request_values',
                      'gestao_cadastros_request_events', 'gestao_cadastros_request_counters']) t,
         unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('authenticated', 'public.' || t, p)
  ),
  'authenticated_can_select_counters', has_table_privilege('authenticated', 'public.gestao_cadastros_request_counters', 'SELECT'),
  'anon_can_select_requests', has_table_privilege('anon', 'public.gestao_cadastros_requests', 'SELECT'),
  'anon_can_create_request', has_function_privilege('anon', 'public.gestao_cadastros_create_request(uuid, jsonb)', 'EXECUTE'),
  'authenticated_can_create_request', has_function_privilege('authenticated', 'public.gestao_cadastros_create_request(uuid, jsonb)', 'EXECUTE')
));
-- Expected: rls_enabled 4 × true (requests, request_values, request_events,
-- request_counters); 3 SELECT policies; authenticated_write_privileges = null;
-- authenticated_can_select_counters, anon_* = false; authenticated_can_create_request = true.

-- 2. Administrator: creates a request; snapshots and guards hold ------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'desenvolvimento@escritoriologica.com.br';
set local role authenticated;

select public.gestao_cadastros_create_request(
  (select s.id from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
   where d.dpto_name = 'Fiscal' and s.name = 'Senha gerente'),
  jsonb_build_object('nome_empresa', '  Empresa Teste  ', 'codigo_empresa', '0001')
) as created;

select request_number, status, service_name, dpto_name, company_name, company_code,
       requester_email, completed_at is null as not_completed
from public.gestao_cadastros_requests;

select field_key, label, field_type, value_text
from public.gestao_cadastros_request_values order by sort_order;

select event_type, visibility, new_value from public.gestao_cadastros_request_events;

reset role;
do $$
begin
  update public.gestao_cadastros_request_values set value_text = 'x';
  raise exception 'GUARD FAILED: a submitted value was changed.';
exception when insufficient_privilege then
  raise notice 'OK: submitted values are append-only.';
end;
$$;
do $$
begin
  update public.gestao_cadastros_requests set service_name = 'x';
  raise exception 'GUARD FAILED: a request snapshot was changed.';
exception when check_violation then
  raise notice 'OK: request snapshot is immutable.';
end;
$$;
do $$
begin
  delete from public.gestao_cadastros_requests;
  raise exception 'GUARD FAILED: a request was deleted.';
exception when insufficient_privilege then
  raise notice 'OK: requests cannot be deleted.';
end;
$$;
rollback;
-- Expected: created = {"id": ..., "request_number": "GC-<year>-000001"} (or the
-- next number of the year); company_name "Empresa Teste" (trimmed), company_code
-- "0001"; 3 values in catalog order (numero_chamado is inactive: the request
-- number is automatic) with observacoes = null; one
-- request_created event (requester); three "OK" notices.

-- 3. Server-side validation --------------------------------------------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'desenvolvimento@escritoriologica.com.br';
set local role authenticated;
do $$
declare
  v_service uuid := (
    select s.id from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
    where d.dpto_name = 'Departamento Pessoal' and s.name = 'Cadastro do Onvio');
  v_detail text;
begin
  begin
    perform public.gestao_cadastros_create_request(v_service,
      jsonb_build_object('nome_empresa', ' ', 'codigo_empresa', 1, 'email_cliente', 'nao-e-email'));
    raise exception 'VALIDATION FAILED: invalid values were accepted.';
  exception when invalid_parameter_value then
    get stacked diagnostics v_detail = pg_exception_detail;
    raise notice 'OK: rejected with %', v_detail;
  end;
  begin
    perform public.gestao_cadastros_create_request(v_service, jsonb_build_object('campo_inexistente', 'x'));
    raise exception 'VALIDATION FAILED: an unknown field was accepted.';
  exception when invalid_parameter_value then
    raise notice 'OK: unknown field rejected.';
  end;
end;
$$;
rollback;
-- Expected: "OK: rejected with" a JSON object with errors for nome_empresa
-- (obrigatório), codigo_empresa (inválido), nome_cliente (obrigatório) and
-- email_cliente (e-mail); "OK: unknown field rejected".

-- 4. Common requester: own department only, own requests only, no internal events
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'desenvolvimento@escritoriologica.com.br';
set local role authenticated;
-- A request by the administrator, with an internal event, that the requester must not see.
select public.gestao_cadastros_create_request(
  (select s.id from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
   where d.dpto_name = 'Fiscal' and s.name = 'Senha gerente'),
  jsonb_build_object('nome_empresa', 'Outra', 'codigo_empresa', '2')
) is not null as admin_request_created;
reset role;
insert into public.gestao_cadastros_request_events (request_id, event_type, visibility, actor_id)
select r.id, 'internal_note_added', 'internal', r.requester_id from public.gestao_cadastros_requests r;

select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;
select public.gestao_cadastros_create_request(
  (select s.id from public.gestao_cadastros_services s where s.name = 'Senha gerente'),
  jsonb_build_object('nome_empresa', 'Minha', 'codigo_empresa', '3')
) is not null as requester_request_created;
select count(*) as requester_sees_requests,
       count(*) filter (where requester_id <> (select private.gestao_cadastros_current_user_id())) as sees_others
from public.gestao_cadastros_requests;
select count(*) filter (where visibility = 'internal') as sees_internal_events
from public.gestao_cadastros_request_events;
do $$
begin
  perform public.gestao_cadastros_create_request(
    (select s.id from public.gestao_cadastros_services s join public.dpto d using (dpto_id)
     where d.dpto_name = 'Departamento Pessoal' and s.name = 'Senha gerente'),
    jsonb_build_object('nome_empresa', 'X', 'codigo_empresa', '1'));
  raise exception 'AUTH FAILED: requester opened a request for another department.';
exception when insufficient_privilege or no_data_found then
  raise notice 'OK: other department denied.';
end;
$$;
rollback;
-- Expected: requester_request_created = true; requester_sees_requests = 1,
-- sees_others = 0; sees_internal_events = 0; "OK: other department denied".
-- (If no Fiscal user has logged in yet, the requester steps do not apply.)
