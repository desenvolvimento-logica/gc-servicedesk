-- Rollback for 20261013180000_gestao_cadastros_service_catalog.sql
-- Removes ONLY the objects created by that migration and restores the Phase 2
-- read-only state of gestao_cadastros_requester_departments. Shared tables are untouched.
-- Run in the Supabase SQL Editor only if the migration must be undone; it
-- refuses to run once requests reference the catalog (Phase 4+).

begin;

do $$
begin
  if to_regclass('public.gestao_cadastros_requests') is not null then
    raise exception 'Requests already exist; the catalog cannot be rolled back.';
  end if;
end;
$$;

drop policy if exists gestao_cadastros_requester_departments_insert on public.gestao_cadastros_requester_departments;
drop policy if exists gestao_cadastros_requester_departments_update on public.gestao_cadastros_requester_departments;
revoke insert, update on table public.gestao_cadastros_requester_departments from authenticated;

drop function if exists public.gestao_cadastros_admin_departments();

drop table if exists public.gestao_cadastros_service_fields;
drop table if exists public.gestao_cadastros_services;

drop function if exists private.gestao_cadastros_guard_service_field_update();
drop function if exists private.gestao_cadastros_guard_service_update();
drop function if exists private.gestao_cadastros_stamp_catalog_row();

drop type if exists public.gestao_cadastros_field_type;
drop type if exists public.gestao_cadastros_service_kind;

commit;
