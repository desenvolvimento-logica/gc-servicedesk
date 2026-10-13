-- Read-only verification for 20261013180000_gestao_cadastros_service_catalog.sql
-- Run in the Supabase SQL Editor after applying the migration.
-- Blocks that write run inside a transaction that is rolled back, impersonating
-- a user through the same JWT claim Supabase sets on API requests.

-- 1. Objects, RLS, privileges and seed data ---------------------------------
select jsonb_pretty(jsonb_build_object(
  'rls_enabled', (
    select jsonb_object_agg(c.relname, c.relrowsecurity)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname like 'gestao_cadastros_%' and c.relkind = 'r'
  ),
  'policies', (
    select jsonb_agg(tablename || ' [' || cmd || '] ' || policyname order by tablename, cmd)
    from pg_policies where tablename like 'gestao_cadastros_%'
  ),
  'services_per_department', (
    select jsonb_object_agg(x.dpto_name, x.total)
    from (
      select d.dpto_name, count(*) as total
      from public.gestao_cadastros_services s
      join public.dpto d using (dpto_id)
      group by d.dpto_name
    ) x
  ),
  'fields_total', (select count(*) from public.gestao_cadastros_service_fields),
  'inactive_fields', (
    select jsonb_agg(s.name || ' / ' || f.label)
    from public.gestao_cadastros_service_fields f
    join public.gestao_cadastros_services s on s.id = f.service_id
    where not f.active
  ),
  'services_without_observacoes', (
    select count(*) from public.gestao_cadastros_services s
    where not exists (
      select 1 from public.gestao_cadastros_service_fields f
      where f.service_id = s.id and f.field_key = 'observacoes'
    )
  ),
  'anon_can_select_services', has_table_privilege('anon', 'public.gestao_cadastros_services', 'SELECT'),
  'authenticated_can_delete_services', has_table_privilege('authenticated', 'public.gestao_cadastros_services', 'DELETE'),
  'authenticated_can_delete_fields', has_table_privilege('authenticated', 'public.gestao_cadastros_service_fields', 'DELETE'),
  'anon_can_call_admin_departments', has_function_privilege('anon', 'public.gestao_cadastros_admin_departments()', 'EXECUTE')
));
-- Expected: rls_enabled all true; 10 policies; Fiscal 20, Departamento Pessoal 6,
-- Contábil 6; fields_total 183; inactive_fields = ["Replicador de acumulador / Anexo"];
-- services_without_observacoes = 0; the four privilege checks = false.

-- 2. Administrator: reads everything, writes are stamped, guards hold --------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'desenvolvimento@escritoriologica.com.br';
set local role authenticated;
select count(*) as admin_sees_services from public.gestao_cadastros_services;
select count(*) as admin_sees_departments from public.gestao_cadastros_admin_departments();
update public.gestao_cadastros_services set description = 'teste'
where name = 'Senha gerente' returning name, updated_by is not null as stamped;
do $$
begin
  update public.gestao_cadastros_service_fields set field_type = 'number' where field_key = 'codigo_empresa';
  raise exception 'GUARD FAILED: field_type was changed.';
exception when check_violation then
  raise notice 'OK: field_type change was rejected.';
end;
$$;
rollback;
-- Expected: admin_sees_services = 32; admin_sees_departments = all corporate
-- departments; 2 rows stamped = true; notice "OK: field_type change was rejected".

-- 3. Operator: reads the catalog, cannot write -----------------------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;
select count(*) as operator_sees_services from public.gestao_cadastros_services;
update public.gestao_cadastros_services set description = 'x' returning id;
rollback;
-- Expected: operator_sees_services = 32; the update returns 0 rows.

-- 4. Common requester (first linked Fiscal user without GC role) -----------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;
select count(*) as requester_sees_services,
       count(distinct dpto_id) as requester_sees_departments
from public.gestao_cadastros_services;
select count(*) as requester_sees_inactive_fields
from public.gestao_cadastros_service_fields where not active;
rollback;
-- Expected: 20 services, 1 department (Fiscal); 0 inactive fields.
-- (If no Fiscal user has logged in yet, both counts are 0 — not an error.)

-- 5. Requester cannot call the admin RPC ------------------------------------
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
  perform public.gestao_cadastros_admin_departments();
  raise exception 'RPC FAILED: requester could list departments.';
exception when insufficient_privilege then
  raise notice 'OK: requester was denied.';
end;
$$;
rollback;
-- Expected: notice "OK: requester was denied".
