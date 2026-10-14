-- Rollback for 20261015120000_gestao_cadastros_user_admin.sql
-- Removes ONLY the objects created by that migration. Role grants already
-- made through the screen stay in gestao_cadastros_user_roles.
-- Refuses to run once role changes were recorded (history is permanent).

begin;

do $$
begin
  if exists (select 1 from public.gestao_cadastros_role_events) then
    raise exception 'Role changes were already recorded; the user admin migration cannot be rolled back.';
  end if;
end;
$$;

drop function if exists public.gestao_cadastros_set_user_role(bigint, public.gestao_cadastros_role, boolean);
drop function if exists public.gestao_cadastros_admin_users();
drop table if exists public.gestao_cadastros_role_events;

commit;
