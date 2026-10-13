-- Rollback for 20261013160000_gestao_cadastros_roles_and_requester_departments.sql
-- Removes ONLY the objects created by that migration. Shared tables are untouched.
-- Run in the Supabase SQL Editor only if the migration must be undone.

begin;

drop function if exists public.gestao_cadastros_my_profile();

drop table if exists public.gestao_cadastros_user_roles;
drop table if exists public.gestao_cadastros_requester_departments;

drop function if exists private.gestao_cadastros_can_open_requests(bigint);
drop function if exists private.gestao_cadastros_has_access();
drop function if exists private.gestao_cadastros_is_requester();
drop function if exists private.gestao_cadastros_is_staff();
drop function if exists private.gestao_cadastros_has_role(public.gestao_cadastros_role);
drop function if exists private.gestao_cadastros_current_user_dpto();
drop function if exists private.gestao_cadastros_current_user_id();
drop function if exists private.gestao_cadastros_set_updated_at();

drop type if exists public.gestao_cadastros_role;

commit;
