-- Read-only verification for 20261015120000_gestao_cadastros_user_admin.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. The editor shows only the last result of each block; a failed check
-- raises an error ("... FAILED"). Writing blocks are rolled back.
-- Ids are resolved before impersonating (public.users RLS hides other rows).

-- 1. Objects and privileges ---------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'role_events_rls', (select relrowsecurity from pg_class where oid = 'public.gestao_cadastros_role_events'::regclass),
  'authenticated_write_on_role_events', (
    select coalesce(jsonb_agg(p), '[]'::jsonb) from unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('authenticated', 'public.gestao_cadastros_role_events', p)
  ),
  'authenticated_write_on_user_roles', (
    select coalesce(jsonb_agg(p), '[]'::jsonb) from unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where has_table_privilege('authenticated', 'public.gestao_cadastros_user_roles', p)
  ),
  'anon_can_execute', (
    has_function_privilege('anon', 'public.gestao_cadastros_admin_users()', 'EXECUTE')
    or has_function_privilege('anon', 'public.gestao_cadastros_set_user_role(bigint, public.gestao_cadastros_role, boolean)', 'EXECUTE')
  )
));
-- Expected: role_events_rls true; both write lists []; anon_can_execute false.

-- 2. Administrator: list, grant/revoke, guards, history -----------------------
begin;
select set_config('gc.admin_id', u.user_id::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'desenvolvimento@escritoriologica.com.br';

-- Any user without GC roles, to grant/revoke operator.
select set_config('gc.target_id', u.user_id::text, true)
from public.users u
where not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id)
order by u.user_id limit 1;

set local role authenticated;

do $$
declare
  v_admin bigint := current_setting('gc.admin_id')::bigint;
  v_target bigint := current_setting('gc.target_id')::bigint;
begin
  if (select count(*) from public.gestao_cadastros_admin_users()) = 0 then
    raise exception 'LIST FAILED: no users returned.';
  end if;

  perform public.gestao_cadastros_set_user_role(v_target, 'operator', true);
  perform public.gestao_cadastros_set_user_role(v_target, 'operator', true); -- no-op, no event
  if not (select is_operator from public.gestao_cadastros_admin_users() where user_id = v_target) then
    raise exception 'GRANT FAILED: target is not an operator.';
  end if;
  perform public.gestao_cadastros_set_user_role(v_target, 'operator', false);

  begin
    perform public.gestao_cadastros_set_user_role(v_admin, 'administrator', false);
    raise exception 'GUARD FAILED: an administrator revoked their own role.';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select jsonb_pretty(jsonb_build_object(
  'target_operator_row_active', (
    select active from public.gestao_cadastros_user_roles
    where user_id = current_setting('gc.target_id')::bigint and role = 'operator'
  ),
  'events', (
    select jsonb_agg(role || ':' || granted order by id) from public.gestao_cadastros_role_events
    where user_id = current_setting('gc.target_id')::bigint
  )
));
rollback;
-- Expected: target_operator_row_active false (kept, deactivated);
-- events = ["operator:true", "operator:false"].

-- 3. Operator: no access --------------------------------------------------------
begin;
select set_config('gc.self_id', u.user_id::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub', u.auth_user_id, 'role', 'authenticated')::text, true)
from public.users u where lower(u.user_email) = 'tributario@escritoriologica.com.br';
set local role authenticated;
do $$
begin
  begin
    perform public.gestao_cadastros_admin_users();
    raise exception 'AUTH FAILED: operator listed users.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.gestao_cadastros_set_user_role(current_setting('gc.self_id')::bigint, 'administrator', true);
    raise exception 'AUTH FAILED: operator granted themselves administrator.';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.gestao_cadastros_role_events) then
    raise exception 'AUTH FAILED: operator can read role history.';
  end if;
end;
$$;
select 'OK: operator denied' as result;
rollback;
-- Expected: "OK: operator denied".
