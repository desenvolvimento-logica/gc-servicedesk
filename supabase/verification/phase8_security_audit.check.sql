-- Phase 8 — read-only security and performance audit of every GC object.
-- Run in the Supabase SQL Editor, one block at a time; nothing is changed.
-- Each block returns one summary; empty lists ("[]" / null) mean "no finding".

-- 1. Tables: RLS on everywhere, no write grants, no anon access --------------
select jsonb_pretty(jsonb_build_object(
  'tables_without_rls', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relname like 'gestao\_cadastros\_%' and not c.relrowsecurity
  ),
  'anon_table_privileges', (
    select coalesce(jsonb_agg(table_name || ':' || privilege_type order by table_name, privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name like 'gestao\_cadastros\_%'
  ),
  'authenticated_write_privileges', (
    select coalesce(jsonb_agg(table_name || ':' || privilege_type order by table_name, privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public' and table_name like 'gestao\_cadastros\_%'
      and privilege_type not in ('SELECT')
  ),
  'authenticated_column_write_privileges', (
    select coalesce(jsonb_agg(distinct table_name || ':' || privilege_type), '[]'::jsonb)
    from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public' and table_name like 'gestao\_cadastros\_%'
      and privilege_type in ('INSERT', 'UPDATE')
  ),
  'policies', (
    select jsonb_agg(tablename || ' [' || cmd || '] ' || array_to_string(roles, ',') order by tablename, cmd)
    from pg_policies where schemaname = 'public' and tablename like 'gestao\_cadastros\_%'
  )
));
-- Expected: tables_without_rls []; anon_table_privileges []; authenticated
-- write privileges only on the catalog tables (services, service_fields,
-- requester_departments: INSERT/UPDATE for administrators via RLS);
-- every policy is for {authenticated}.

-- 2. Functions: search_path pinned, no PUBLIC/anon EXECUTE ---------------------
select jsonb_pretty(jsonb_build_object(
  'functions_without_search_path', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by 1), '[]'::jsonb)
    from pg_proc p
    where p.proname like 'gestao\_cadastros\_%'
      and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  ),
  'executable_by_anon_or_public', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by 1), '[]'::jsonb)
    from pg_proc p
    where p.proname like 'gestao\_cadastros\_%'
      and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0))
  ),
  'security_definer_functions', (
    select jsonb_agg(p.oid::regprocedure::text order by 1)
    from pg_proc p
    where p.proname like 'gestao\_cadastros\_%' and p.prosecdef
  ),
  'public_functions_callable_by_authenticated', (
    select jsonb_agg(p.oid::regprocedure::text order by 1)
    from pg_proc p
    where p.proname like 'gestao\_cadastros\_%' and p.pronamespace = 'public'::regnamespace
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
));
-- Expected: functions_without_search_path []; executable_by_anon_or_public [];
-- the public functions callable by authenticated are exactly: my_profile,
-- admin_departments, create_request, operators, assign_request,
-- change_request_status, add_internal_note, report_summary, report_requests
-- (each checks the caller's role itself).

-- 3. Triggers that protect history are enabled ----------------------------------
select jsonb_pretty(jsonb_build_object(
  'guard_triggers', (
    select jsonb_object_agg(t.tgname, t.tgenabled <> 'D')
    from pg_trigger t
    where t.tgname in ('gestao_cadastros_requests_guard', 'gestao_cadastros_requests_no_delete',
                       'gestao_cadastros_request_values_append_only', 'gestao_cadastros_request_events_append_only',
                       'gestao_cadastros_services_guard', 'gestao_cadastros_service_fields_guard')
  )
));
-- Expected: all six = true.

-- 4. Query plans of the main paths (planner choices on current data) -------------
-- With few rows Postgres may prefer sequential scans; that is expected. Run
-- again when volume grows. Look for "Index Scan"/"Bitmap Index Scan" on the
-- gestao_cadastros_requests_* indexes once there are thousands of rows.
explain (format text)
select id from public.gestao_cadastros_requests
where status in ('open', 'in_progress')
order by opened_at desc limit 20;

explain (format text)
select id from public.gestao_cadastros_requests
where opened_at >= now() - interval '30 days'
order by opened_at desc;

explain (format text)
select id from public.gestao_cadastros_requests
where requester_id = 1
order by opened_at desc limit 20;
