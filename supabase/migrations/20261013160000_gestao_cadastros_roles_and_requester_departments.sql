-- =============================================================================
-- GC Service Desk — Phase 2: access model (roles and requester departments)
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates only objects prefixed `gestao_cadastros_` (public schema) and
--     helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced. No column, trigger, policy or function is added to or
--     changed on them, and no existing function is replaced.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261013160000_gestao_cadastros_roles_and_requester_departments.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  -- RLS policies below call functions in schema `private`; the querying role
  -- needs USAGE on it (other apps' policies already rely on this).
  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Role "authenticated" lacks USAGE on schema private. Review before applying.';
  end if;

  -- Identity resolution relies on public.users.auth_user_id being unique.
  if exists (
    select 1 from public.users
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ) then
    raise exception 'public.users has duplicated auth_user_id values. Review before applying.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create type public.gestao_cadastros_role as enum ('operator', 'administrator');

comment on type public.gestao_cadastros_role is
  'GC Service Desk roles. "Requester" is not a role: it derives from the user''s department.';

create table public.gestao_cadastros_user_roles (
  id         uuid primary key default gen_random_uuid(),
  -- Cascade so deleting a corporate user in other apps is never blocked by us.
  user_id    bigint not null references public.users (user_id) on delete cascade,
  role       public.gestao_cadastros_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gestao_cadastros_user_roles_user_role_key unique (user_id, role)
);

comment on table public.gestao_cadastros_user_roles is
  'GC Service Desk operator/administrator grants for corporate users (public.users).';

create table public.gestao_cadastros_requester_departments (
  -- Cascade so deleting a department in other apps is never blocked by us.
  dpto_id    bigint primary key references public.dpto (dpto_id) on delete cascade,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gestao_cadastros_requester_departments is
  'Corporate departments (public.dpto) whose members may open GC Service Desk requests.';

create function private.gestao_cadastros_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger gestao_cadastros_user_roles_set_updated_at
  before update on public.gestao_cadastros_user_roles
  for each row execute function private.gestao_cadastros_set_updated_at();

create trigger gestao_cadastros_requester_departments_set_updated_at
  before update on public.gestao_cadastros_requester_departments
  for each row execute function private.gestao_cadastros_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Authorization helpers (private schema: not exposed through the Data API)
--    SECURITY DEFINER so they can read the shared/own tables regardless of the
--    caller's RLS; each one only ever answers about the calling user.
-- -----------------------------------------------------------------------------

-- Corporate user id of the caller; NULL when not linked (or ambiguously linked).
create function private.gestao_cadastros_current_user_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then min(u.user_id) end
  from public.users u
  where u.auth_user_id = (select auth.uid());
$$;

create function private.gestao_cadastros_current_user_dpto()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_dpto
  from public.users u
  where u.user_id = private.gestao_cadastros_current_user_id();
$$;

create function private.gestao_cadastros_has_role(p_role public.gestao_cadastros_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gestao_cadastros_user_roles r
    where r.user_id = private.gestao_cadastros_current_user_id()
      and r.role = p_role
      and r.active
  );
$$;

-- Operator or administrator: may open requests for any active requester
-- department and see every request.
create function private.gestao_cadastros_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gestao_cadastros_user_roles r
    where r.user_id = private.gestao_cadastros_current_user_id()
      and r.active
  );
$$;

-- Member of an active requester department.
create function private.gestao_cadastros_is_requester()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gestao_cadastros_requester_departments d
    where d.dpto_id = private.gestao_cadastros_current_user_dpto()
      and d.active
  );
$$;

create function private.gestao_cadastros_has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.gestao_cadastros_is_staff() or private.gestao_cadastros_is_requester();
$$;

-- Whether the caller may open a request on behalf of department p_dpto_id:
-- staff -> any active requester department; requester -> only their own.
create function private.gestao_cadastros_can_open_requests(p_dpto_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gestao_cadastros_requester_departments d
    where d.dpto_id = p_dpto_id
      and d.active
      and (
        private.gestao_cadastros_is_staff()
        or d.dpto_id = private.gestao_cadastros_current_user_dpto()
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Profile RPC (public schema so the app can call it through the Data API)
--    Returns ONLY the caller's own profile, or NULL when the login is not
--    linked to a corporate user. Needed because public.dpto RLS restricts
--    department names to corporate admins.
-- -----------------------------------------------------------------------------
create function public.gestao_cadastros_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select u.user_id, u.user_name, u.user_email, u.user_dpto
    from public.users u
    where u.user_id = private.gestao_cadastros_current_user_id()
  )
  select jsonb_build_object(
    'user_id', me.user_id,
    'name', me.user_name,
    'email', me.user_email,
    'department', case when d.dpto_id is null then null
                       else jsonb_build_object('id', d.dpto_id, 'name', d.dpto_name) end,
    'roles', coalesce((
      select jsonb_agg(r.role order by r.role)
      from public.gestao_cadastros_user_roles r
      where r.user_id = me.user_id and r.active
    ), '[]'::jsonb),
    'is_requester', private.gestao_cadastros_is_requester(),
    'request_departments', coalesce((
      select jsonb_agg(jsonb_build_object('id', rd.dpto_id, 'name', d2.dpto_name)
                       order by rd.sort_order, d2.dpto_name)
      from public.gestao_cadastros_requester_departments rd
      join public.dpto d2 on d2.dpto_id = rd.dpto_id
      where private.gestao_cadastros_can_open_requests(rd.dpto_id)
    ), '[]'::jsonb)
  )
  from me
  left join public.dpto d on d.dpto_id = me.user_dpto;
$$;

comment on function public.gestao_cadastros_my_profile() is
  'GC Service Desk: profile, roles and allowed request departments of the calling user only.';

-- -----------------------------------------------------------------------------
-- 4. Privileges (functions default to EXECUTE for PUBLIC; tables get broad
--    Supabase default grants — narrow both)
-- -----------------------------------------------------------------------------
revoke all on function private.gestao_cadastros_set_updated_at() from public, anon, authenticated;
revoke all on function private.gestao_cadastros_current_user_id() from public, anon;
revoke all on function private.gestao_cadastros_current_user_dpto() from public, anon;
revoke all on function private.gestao_cadastros_has_role(public.gestao_cadastros_role) from public, anon;
revoke all on function private.gestao_cadastros_is_staff() from public, anon;
revoke all on function private.gestao_cadastros_is_requester() from public, anon;
revoke all on function private.gestao_cadastros_has_access() from public, anon;
revoke all on function private.gestao_cadastros_can_open_requests(bigint) from public, anon;
revoke all on function public.gestao_cadastros_my_profile() from public, anon;

grant execute on function private.gestao_cadastros_current_user_id() to authenticated;
grant execute on function private.gestao_cadastros_current_user_dpto() to authenticated;
grant execute on function private.gestao_cadastros_has_role(public.gestao_cadastros_role) to authenticated;
grant execute on function private.gestao_cadastros_is_staff() to authenticated;
grant execute on function private.gestao_cadastros_is_requester() to authenticated;
grant execute on function private.gestao_cadastros_has_access() to authenticated;
grant execute on function private.gestao_cadastros_can_open_requests(bigint) to authenticated;
grant execute on function public.gestao_cadastros_my_profile() to authenticated;

-- Read-only for now: writes arrive with the administration screens (Phase 3).
revoke all on table public.gestao_cadastros_user_roles from anon, authenticated;
revoke all on table public.gestao_cadastros_requester_departments from anon, authenticated;
grant select on table public.gestao_cadastros_user_roles to authenticated;
grant select on table public.gestao_cadastros_requester_departments to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.gestao_cadastros_user_roles enable row level security;
alter table public.gestao_cadastros_requester_departments enable row level security;

create policy gestao_cadastros_user_roles_select
  on public.gestao_cadastros_user_roles
  for select
  to authenticated
  using (
    user_id = (select private.gestao_cadastros_current_user_id())
    or (select private.gestao_cadastros_has_role('administrator'))
  );

create policy gestao_cadastros_requester_departments_select
  on public.gestao_cadastros_requester_departments
  for select
  to authenticated
  using ((select private.gestao_cadastros_has_access()));

-- -----------------------------------------------------------------------------
-- 6. Initial data (looked up by name/e-mail; aborts if anything is missing)
-- -----------------------------------------------------------------------------
do $$
declare
  inserted integer;
begin
  insert into public.gestao_cadastros_requester_departments (dpto_id, sort_order)
  select d.dpto_id, v.sort_order
  from (values ('Fiscal', 10), ('Contábil', 20), ('Departamento Pessoal', 30)) as v (name, sort_order)
  join public.dpto d on d.dpto_name = v.name;

  get diagnostics inserted = row_count;
  if inserted <> 3 then
    raise exception 'Expected 3 requester departments, found %.', inserted;
  end if;

  insert into public.gestao_cadastros_user_roles (user_id, role)
  select u.user_id, v.role::public.gestao_cadastros_role
  from (values
    ('desenvolvimento@escritoriologica.com.br', 'administrator'),
    ('anabovi.gestaodecadastros@escritoriologica.com.br', 'operator'),
    ('tributario@escritoriologica.com.br', 'operator')
  ) as v (email, role)
  join public.users u on lower(u.user_email) = v.email;

  get diagnostics inserted = row_count;
  if inserted <> 3 then
    raise exception 'Expected 3 initial role grants, found % (missing or duplicated e-mails).', inserted;
  end if;
end;
$$;

commit;
