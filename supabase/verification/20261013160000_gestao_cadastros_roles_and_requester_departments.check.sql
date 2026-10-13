-- Read-only verification for 20261013160000_gestao_cadastros_roles_and_requester_departments.sql
-- Run in the Supabase SQL Editor after applying the migration.
-- Each block runs inside a transaction that is rolled back, impersonating a
-- user through the same JWT claim Supabase sets on API requests.

-- 1. Objects, RLS and seed data --------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'rls_enabled', (
    select jsonb_object_agg(c.relname, c.relrowsecurity)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname like 'gestao_cadastros_%' and c.relkind = 'r'
  ),
  'policies', (
    select jsonb_agg(tablename || ' [' || cmd || '] ' || policyname)
    from pg_policies where tablename like 'gestao_cadastros_%'
  ),
  'requester_departments', (
    select jsonb_agg(d.dpto_name order by rd.sort_order)
    from public.gestao_cadastros_requester_departments rd
    join public.dpto d using (dpto_id)
  ),
  'roles', (
    select jsonb_agg(u.user_email || ' = ' || r.role order by u.user_email)
    from public.gestao_cadastros_user_roles r
    join public.users u using (user_id)
  ),
  'anon_can_call_profile', has_function_privilege('anon', 'public.gestao_cadastros_my_profile()', 'EXECUTE'),
  'anon_can_select_roles', has_table_privilege('anon', 'public.gestao_cadastros_user_roles', 'SELECT'),
  'authenticated_can_insert_roles', has_table_privilege('authenticated', 'public.gestao_cadastros_user_roles', 'INSERT')
));
-- Expected: rls_enabled all true; 2 select policies; Fiscal, Contábil,
-- Departamento Pessoal; 3 role grants; the three privilege checks = false.

-- 2. Profile as the administrator ------------------------------------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'desenvolvimento@escritoriologica.com.br';
set local role authenticated;
select jsonb_pretty(public.gestao_cadastros_my_profile()) as admin_profile;
select count(*) as admin_sees_role_rows from public.gestao_cadastros_user_roles;
rollback;
-- Expected: roles ["administrator"], is_requester false, 3 request_departments;
-- admin_sees_role_rows = 3.

-- 3. Profile as an operator ------------------------------------------------
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;
select jsonb_pretty(public.gestao_cadastros_my_profile()) as operator_profile;
select count(*) as operator_sees_role_rows from public.gestao_cadastros_user_roles;
rollback;
-- Expected: roles ["operator"], 3 request_departments; operator_sees_role_rows = 1 (own).

-- 4. Profile as a common requester (first linked Fiscal user without GC role)
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u
join public.dpto d on d.dpto_id = u.user_dpto
where d.dpto_name = 'Fiscal'
  and u.auth_user_id is not null
  and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
limit 1;
set local role authenticated;
select jsonb_pretty(public.gestao_cadastros_my_profile()) as requester_profile;
select count(*) as requester_sees_role_rows from public.gestao_cadastros_user_roles;
rollback;
-- Expected: roles [], is_requester true, request_departments = only Fiscal;
-- requester_sees_role_rows = 0.
-- (If no Fiscal user has logged in yet, the profile is NULL — not an error.)

-- 5. Anonymous caller ------------------------------------------------------
begin;
set local role anon;
select public.gestao_cadastros_my_profile();
rollback;
-- Expected: ERROR "permission denied for function gestao_cadastros_my_profile".
