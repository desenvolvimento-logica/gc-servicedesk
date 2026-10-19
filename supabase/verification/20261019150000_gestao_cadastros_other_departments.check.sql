-- Read-only verification for 20261019150000_gestao_cadastros_other_departments.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. The editor shows only the last result of each block; a failed check
-- raises an error ("... FAILED"). Writing blocks are rolled back.

-- 1. Structure and data --------------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'catch_all', (
    select jsonb_agg(jsonb_build_object('id', dpto_id, 'name', name, 'active', active, 'corporate_dpto_id', corporate_dpto_id))
    from public.gestao_cadastros_requester_departments where catch_all
  ),
  'corporate_rows_keep_fk', (
    select bool_and(corporate_dpto_id = dpto_id)
    from public.gestao_cadastros_requester_departments where not catch_all
  ),
  'outros_by_department', (
    select jsonb_object_agg(coalesce(rd.name, d.dpto_name::text), (
      select count(*) from public.gestao_cadastros_service_fields f where f.service_id = s.id
    ))
    from public.gestao_cadastros_services s
    join public.gestao_cadastros_requester_departments rd on rd.dpto_id = s.dpto_id
    left join public.dpto d on d.dpto_id = s.dpto_id
    where s.name = 'Outros'
  ),
  'helper_executable_by_authenticated',
    has_function_privilege('authenticated', 'private.gestao_cadastros_in_catch_all(bigint)', 'EXECUTE')
));
-- Expected: catch_all [{id -1, "Demais Departamentos", active true,
-- corporate_dpto_id null}]; corporate_rows_keep_fk true; outros_by_department
-- Fiscal/Departamento Pessoal/Contábil/Demais Departamentos = 4 fields each;
-- helper_executable_by_authenticated false.

-- 2. A member of another department: only "Demais Departamentos" --------------
-- Uses a linked user with no GC role whose department is not a requester one.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
where u.auth_user_id is not null
  and u.user_dpto is not null
  and not exists (select 1 from public.gestao_cadastros_requester_departments rd where rd.dpto_id = u.user_dpto)
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id and r.active)
order by u.user_id
limit 1;
-- Read before switching role: the user cannot see Fiscal services.
select set_config('gc_check.fiscal_outros', s.id::text, true)
from public.gestao_cadastros_services s
join public.dpto d on d.dpto_id = s.dpto_id
where d.dpto_name = 'Fiscal' and s.name = 'Outros';
set local role authenticated;
do $$
declare
  v_profile jsonb := public.gestao_cadastros_my_profile();
  v_outros  uuid;
  v_fiscal  uuid := current_setting('gc_check.fiscal_outros')::uuid;
begin
  if v_profile is null then
    raise exception 'SETUP FAILED: no linked user from another department found.';
  end if;
  if not (v_profile ->> 'is_requester')::boolean then
    raise exception 'ACCESS FAILED: member of another department is not a requester.';
  end if;
  if v_profile -> 'request_departments' <> '[{"id": -1, "name": "Demais Departamentos"}]'::jsonb then
    raise exception 'ACCESS FAILED: unexpected request departments %.', v_profile -> 'request_departments';
  end if;

  -- RLS: sees only the catch-all services.
  if exists (select 1 from public.gestao_cadastros_services where dpto_id <> -1) then
    raise exception 'AUTH FAILED: sees services of other departments.';
  end if;
  select id into v_outros from public.gestao_cadastros_services where dpto_id = -1 and name = 'Outros';
  if v_outros is null then
    raise exception 'READ FAILED: "Outros" of Demais Departamentos not visible.';
  end if;

  -- Opens a request in Demais Departamentos (rolled back below).
  perform public.gestao_cadastros_create_request(
    v_outros, jsonb_build_object('descricao_solicitacao', 'Verificação da migration'));
  if not exists (select 1 from public.gestao_cadastros_requests where dpto_id = -1 and dpto_name = 'Demais Departamentos') then
    raise exception 'CREATE FAILED: request not stored with the catch-all department.';
  end if;

  -- Cannot open a request in a corporate requester department.
  begin
    perform public.gestao_cadastros_create_request(
      v_fiscal, jsonb_build_object('descricao_solicitacao', 'Verificação da migration'));
    raise exception 'AUTH FAILED: opened a request in Fiscal.';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select 'OK: other department opens only in Demais Departamentos' as result;
rollback;
-- Expected: "OK: other department opens only in Demais Departamentos".

-- 3. A Fiscal member without GC roles does not get "Demais Departamentos" -----
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where u.auth_user_id is not null
  and d.dpto_name = 'Fiscal'
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id and r.active)
order by u.user_id
limit 1;
set local role authenticated;
do $$
declare
  v_profile jsonb := public.gestao_cadastros_my_profile();
begin
  if v_profile is null then
    raise exception 'SETUP FAILED: no linked Fiscal user without GC roles found.';
  end if;
  if jsonb_array_length(v_profile -> 'request_departments') <> 1
     or (v_profile -> 'request_departments' -> 0 ->> 'id')::bigint = -1 then
    raise exception 'ACCESS FAILED: Fiscal member request departments %.', v_profile -> 'request_departments';
  end if;
end;
$$;
select 'OK: Fiscal member keeps only Fiscal' as result;
rollback;
-- Expected: "OK: Fiscal member keeps only Fiscal".

-- 4. Administrators cannot create or rename catch-all rows (column grants) ----
select jsonb_pretty(jsonb_build_object(
  'insert_catch_all', has_column_privilege('authenticated', 'public.gestao_cadastros_requester_departments', 'catch_all', 'INSERT'),
  'insert_name', has_column_privilege('authenticated', 'public.gestao_cadastros_requester_departments', 'name', 'INSERT'),
  'update_name', has_column_privilege('authenticated', 'public.gestao_cadastros_requester_departments', 'name', 'UPDATE')
));
-- Expected: all false.
