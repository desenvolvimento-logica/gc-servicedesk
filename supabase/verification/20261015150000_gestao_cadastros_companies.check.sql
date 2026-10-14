-- Read-only verification for 20261015150000_gestao_cadastros_companies.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. The editor shows only the last result of each block; a failed check
-- raises an error ("... FAILED"). Writing blocks are rolled back.

-- 1. Objects and privileges ---------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'rls', (
    select jsonb_object_agg(relname, relrowsecurity) from pg_class
    where oid in ('public.gestao_cadastros_companies'::regclass, 'public.gestao_cadastros_company_sync_runs'::regclass)
  ),
  'authenticated_writes', (
    select coalesce(jsonb_agg(t || ':' || p), '[]'::jsonb)
    from unnest(array['gestao_cadastros_companies', 'gestao_cadastros_company_sync_runs']) t,
         unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('authenticated', 'public.' || t, p)
  ),
  'anon_select', (
    has_table_privilege('anon', 'public.gestao_cadastros_companies', 'SELECT')
    or has_table_privilege('anon', 'public.gestao_cadastros_company_sync_runs', 'SELECT')
  ),
  'service_role_can_write', (
    has_table_privilege('service_role', 'public.gestao_cadastros_companies', 'INSERT')
    and has_table_privilege('service_role', 'public.gestao_cadastros_companies', 'UPDATE')
    and has_table_privilege('service_role', 'public.gestao_cadastros_company_sync_runs', 'INSERT')
  )
));
-- Expected: rls both true; authenticated_writes []; anon_select false;
-- service_role_can_write true.

-- 2. Visibility: users with access read companies; only admins read sync runs
begin;
insert into public.gestao_cadastros_companies (acessorias_id, document, legal_name, active, search_text)
values (999999999, '00000000000000', 'EMPRESA VERIFICACAO', true, 'empresa verificacao');
insert into public.gestao_cadastros_company_sync_runs (trigger, mode, status) values ('cron', 'full', 'success');

select set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.gestao_cadastros_companies where acessorias_id = 999999999) then
    raise exception 'READ FAILED: operator cannot see companies.';
  end if;
  if exists (select 1 from public.gestao_cadastros_company_sync_runs) then
    raise exception 'AUTH FAILED: operator can read sync runs.';
  end if;
  begin
    update public.gestao_cadastros_companies set legal_name = 'x' where acessorias_id = 999999999;
    raise exception 'AUTH FAILED: operator updated a company.';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select 'OK: operator reads companies, no writes, no sync log' as result;
rollback;
-- Expected: "OK: operator reads companies, no writes, no sync log".
