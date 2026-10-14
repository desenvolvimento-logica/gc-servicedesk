-- =============================================================================
-- GC Service Desk — user and role administration
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates only objects prefixed `gestao_cadastros_` (public schema) and
--     helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ.
--     Users are never created here: they come from the corporate registry.
--
-- Rules:
--   * Only GC administrators list users and grant/revoke the operator and
--     administrator roles. Revoking deactivates the row (never deleted).
--   * An administrator cannot revoke their own administrator role, and the
--     last active administrator cannot be revoked (no lockout).
--   * Every change is recorded in gestao_cadastros_role_events (append-only).
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261015120000_gestao_cadastros_user_admin.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind)') is null then
    raise exception 'Phase 7 migration (20261015090000) is not applied.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Role change history (append-only)
-- -----------------------------------------------------------------------------
create table public.gestao_cadastros_role_events (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.users (user_id) on delete restrict,
  user_name   text,
  role        public.gestao_cadastros_role not null,
  granted     boolean not null,
  actor_id    bigint not null references public.users (user_id) on delete restrict,
  actor_name  text,
  created_at  timestamptz not null default now()
);

comment on table public.gestao_cadastros_role_events is
  'GC Service Desk: append-only history of operator/administrator grants and revocations.';

create index gestao_cadastros_role_events_created_idx
  on public.gestao_cadastros_role_events (created_at desc);
create index gestao_cadastros_role_events_user_idx
  on public.gestao_cadastros_role_events (user_id, created_at desc);

create trigger gestao_cadastros_role_events_append_only
  before update or delete on public.gestao_cadastros_role_events
  for each row execute function private.gestao_cadastros_reject_change();

revoke all on table public.gestao_cadastros_role_events from anon, authenticated;
grant select on table public.gestao_cadastros_role_events to authenticated;

alter table public.gestao_cadastros_role_events enable row level security;

create policy gestao_cadastros_role_events_select
  on public.gestao_cadastros_role_events
  for select
  to authenticated
  using ((select private.gestao_cadastros_has_role('administrator')));

-- -----------------------------------------------------------------------------
-- 2. Admin RPCs
-- -----------------------------------------------------------------------------

-- Corporate users with their GC access. Administrators only.
create function public.gestao_cadastros_admin_users()
returns table (
  user_id           bigint,
  name              text,
  email             text,
  department_name   text,
  linked            boolean,
  can_open_requests boolean,
  is_operator       boolean,
  is_administrator  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.gestao_cadastros_has_role('administrator') then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.user_id,
           coalesce(nullif(btrim(u.user_name::text), ''), u.user_email::text),
           u.user_email::text,
           d.dpto_name::text,
           u.auth_user_id is not null,
           exists (
             select 1 from public.gestao_cadastros_requester_departments rd
             where rd.dpto_id = u.user_dpto and rd.active
           ),
           exists (
             select 1 from public.gestao_cadastros_user_roles r
             where r.user_id = u.user_id and r.role = 'operator' and r.active
           ),
           exists (
             select 1 from public.gestao_cadastros_user_roles r
             where r.user_id = u.user_id and r.role = 'administrator' and r.active
           )
    from public.users u
    left join public.dpto d on d.dpto_id = u.user_dpto
    order by 2;
end;
$$;

comment on function public.gestao_cadastros_admin_users() is
  'GC Service Desk: corporate users with their GC roles and requester access. Administrators only.';

-- Grants (p_granted = true) or revokes a GC role. Administrators only; audited.
create function public.gestao_cadastros_set_user_role(
  p_user_id bigint,
  p_role public.gestao_cadastros_role,
  p_granted boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor   bigint := private.gestao_cadastros_current_user_id();
  v_current boolean;
begin
  if v_actor is null or not private.gestao_cadastros_has_role('administrator') then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;
  if p_user_id is null or p_role is null or p_granted is null then
    raise exception 'Invalid arguments.' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.users u where u.user_id = p_user_id) then
    raise exception 'User not found.' using errcode = 'no_data_found';
  end if;

  -- Serialize role changes so the "last administrator" check cannot race.
  lock table public.gestao_cadastros_user_roles in share row exclusive mode;

  select r.active into v_current
  from public.gestao_cadastros_user_roles r
  where r.user_id = p_user_id and r.role = p_role;

  if coalesce(v_current, false) = p_granted then
    return;
  end if;

  if p_role = 'administrator' and not p_granted then
    if p_user_id = v_actor then
      raise exception 'You cannot revoke your own administrator role.'
        using errcode = 'object_not_in_prerequisite_state', hint = 'self';
    end if;
    if (select count(*) from public.gestao_cadastros_user_roles r
        where r.role = 'administrator' and r.active) <= 1 then
      raise exception 'At least one active administrator is required.'
        using errcode = 'object_not_in_prerequisite_state', hint = 'last_admin';
    end if;
  end if;

  insert into public.gestao_cadastros_user_roles as r (user_id, role, active)
  values (p_user_id, p_role, p_granted)
  on conflict (user_id, role) do update set active = excluded.active;

  insert into public.gestao_cadastros_role_events (user_id, user_name, role, granted, actor_id, actor_name)
  values (
    p_user_id, private.gestao_cadastros_user_name(p_user_id), p_role, p_granted,
    v_actor, private.gestao_cadastros_user_name(v_actor)
  );
end;
$$;

comment on function public.gestao_cadastros_set_user_role(bigint, public.gestao_cadastros_role, boolean) is
  'GC Service Desk: grants or revokes the operator/administrator role. Administrators only; audited; never removes the last administrator.';

-- -----------------------------------------------------------------------------
-- 3. Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.gestao_cadastros_admin_users() from public, anon;
revoke all on function public.gestao_cadastros_set_user_role(bigint, public.gestao_cadastros_role, boolean) from public, anon;
grant execute on function public.gestao_cadastros_admin_users() to authenticated;
grant execute on function public.gestao_cadastros_set_user_role(bigint, public.gestao_cadastros_role, boolean) to authenticated;

commit;
