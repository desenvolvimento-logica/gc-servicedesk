-- =============================================================================
-- GC Service Desk — Phase 5: operational workflow (assignment, status, notes)
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates/alters only objects prefixed `gestao_cadastros_` (public schema)
--     and helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced. No column, trigger, policy or function is added to or
--     changed on them, and no existing function is replaced.
--
-- Decisions (approved 2026-10-14):
--   * Status transitions: open -> in_progress, open -> closed,
--     in_progress -> closed. Nothing returns to "open"; closed is final.
--   * A request may be assigned (or reassigned) to any active operator by any
--     staff member. Assignment does not change the status.
--   * Closing requires no assignment and no comment (for now).
--   * Status, assignment and closing events are requester-visible; internal
--     notes are staff-only.
--
-- Writes still go only through SECURITY DEFINER RPCs that check the staff
-- role, lock the request row and append the matching history event in the
-- same transaction. The app keeps SELECT-only table privileges.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261014150000_gestao_cadastros_request_workflow.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.gestao_cadastros_requests') is null then
    raise exception 'Phase 4 migration (20261014120000) is not applied.';
  end if;
  if exists (select 1 from public.gestao_cadastros_requests where status = 'closed') then
    raise exception 'Closed requests already exist; review closed_by before applying.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Columns: assignee name snapshot and who closed the request
-- -----------------------------------------------------------------------------
alter table public.gestao_cadastros_requests
  add column assigned_to_name text,
  add column closed_by        bigint references public.users (user_id) on delete restrict,
  add column closed_by_name   text,
  add constraint gestao_cadastros_requests_closed_by_check
    check ((status = 'closed') = (closed_by is not null)),
  add constraint gestao_cadastros_requests_assigned_name_check
    check (assigned_to is not null or assigned_to_name is null);

comment on column public.gestao_cadastros_requests.assigned_to_name is
  'Snapshot of the assignee name at assignment time (public.users names are not readable by every role).';
comment on column public.gestao_cadastros_requests.closed_by is
  'Staff member who closed the request (executing operator for rework reporting).';

create index gestao_cadastros_requests_closed_by_idx
  on public.gestao_cadastros_requests (closed_by) where closed_by is not null;

-- -----------------------------------------------------------------------------
-- 2. Guard: also forbid going back to "open" (defense in depth for the RPCs)
-- -----------------------------------------------------------------------------
create or replace function private.gestao_cadastros_guard_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.request_number      is distinct from old.request_number
     or new.service_id       is distinct from old.service_id
     or new.service_name     is distinct from old.service_name
     or new.service_kind     is distinct from old.service_kind
     or new.dpto_id          is distinct from old.dpto_id
     or new.dpto_name        is distinct from old.dpto_name
     or new.requester_id     is distinct from old.requester_id
     or new.requester_name   is distinct from old.requester_name
     or new.requester_email  is distinct from old.requester_email
     or new.requester_dpto_id   is distinct from old.requester_dpto_id
     or new.requester_dpto_name is distinct from old.requester_dpto_name
     or new.company_name     is distinct from old.company_name
     or new.company_code     is distinct from old.company_code
     or new.original_request_id is distinct from old.original_request_id
     or new.opened_at        is distinct from old.opened_at then
    raise exception 'Submitted request data cannot be changed.'
      using errcode = 'check_violation';
  end if;
  if old.status = 'closed' then
    raise exception 'A closed request cannot be changed.'
      using errcode = 'check_violation';
  end if;
  if new.status = 'open' and old.status <> 'open' then
    raise exception 'A request cannot return to "open".'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Helpers
-- -----------------------------------------------------------------------------
create function private.gestao_cadastros_user_name(p_user_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(u.user_name::text), ''), u.user_email::text)
  from public.users u
  where u.user_id = p_user_id;
$$;

-- Locks and returns the request for a staff action; raises when the caller is
-- not staff, the request does not exist, or it is already closed.
create function private.gestao_cadastros_lock_open_request(p_request_id uuid)
returns public.gestao_cadastros_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.gestao_cadastros_requests;
begin
  if private.gestao_cadastros_current_user_id() is null or not private.gestao_cadastros_is_staff() then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request
  from public.gestao_cadastros_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found.' using errcode = 'no_data_found';
  end if;
  if v_request.status = 'closed' then
    raise exception 'Request is closed.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  return v_request;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Staff RPCs
-- -----------------------------------------------------------------------------

-- Active operators, for the assignment picker. Staff only.
create function public.gestao_cadastros_operators()
returns table (user_id bigint, name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.gestao_cadastros_is_staff() then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.user_id,
           coalesce(nullif(btrim(u.user_name::text), ''), u.user_email::text),
           u.user_email::text
    from public.gestao_cadastros_user_roles r
    join public.users u on u.user_id = r.user_id
    where r.role = 'operator' and r.active
    order by 2;
end;
$$;

comment on function public.gestao_cadastros_operators() is
  'GC Service Desk: active operators (assignable users). Staff only.';

-- Assigns the request to an active operator, or unassigns it (p_assignee_id null).
create function public.gestao_cadastros_assign_request(p_request_id uuid, p_assignee_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor    bigint := private.gestao_cadastros_current_user_id();
  v_request  public.gestao_cadastros_requests := private.gestao_cadastros_lock_open_request(p_request_id);
  v_name     text;
begin
  if p_assignee_id is not distinct from v_request.assigned_to then
    return;
  end if;

  if p_assignee_id is not null then
    if not exists (
      select 1 from public.gestao_cadastros_user_roles r
      where r.user_id = p_assignee_id and r.role = 'operator' and r.active
    ) then
      raise exception 'Assignee is not an active operator.' using errcode = 'invalid_parameter_value';
    end if;
    v_name := private.gestao_cadastros_user_name(p_assignee_id);
  end if;

  update public.gestao_cadastros_requests
  set assigned_to = p_assignee_id, assigned_to_name = v_name
  where id = v_request.id;

  insert into public.gestao_cadastros_request_events (
    request_id, event_type, visibility, actor_id, actor_name, previous_value, new_value
  )
  values (
    v_request.id,
    case when p_assignee_id is null then 'unassigned' else 'assigned' end::public.gestao_cadastros_request_event_type,
    'requester',
    v_actor,
    private.gestao_cadastros_user_name(v_actor),
    case when v_request.assigned_to is null then null
         else jsonb_build_object('user_id', v_request.assigned_to, 'name', v_request.assigned_to_name) end,
    case when p_assignee_id is null then null
         else jsonb_build_object('user_id', p_assignee_id, 'name', v_name) end
  );
end;
$$;

-- Moves the request forward: open -> in_progress, open|in_progress -> closed.
create function public.gestao_cadastros_change_request_status(
  p_request_id uuid,
  p_status public.gestao_cadastros_request_status
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor      bigint := private.gestao_cadastros_current_user_id();
  v_request    public.gestao_cadastros_requests := private.gestao_cadastros_lock_open_request(p_request_id);
  v_actor_name text := private.gestao_cadastros_user_name(v_actor);
begin
  if p_status is null or p_status = v_request.status then
    return;
  end if;

  if p_status = 'open' then
    raise exception 'A request cannot return to "open".' using errcode = 'object_not_in_prerequisite_state';
  end if;

  if p_status = 'closed' then
    update public.gestao_cadastros_requests
    set status = 'closed', completed_at = now(), closed_by = v_actor, closed_by_name = v_actor_name
    where id = v_request.id;
  else
    update public.gestao_cadastros_requests
    set status = p_status
    where id = v_request.id;
  end if;

  insert into public.gestao_cadastros_request_events (
    request_id, event_type, visibility, actor_id, actor_name, previous_value, new_value
  )
  values (
    v_request.id,
    case when p_status = 'closed' then 'request_closed' else 'status_changed' end::public.gestao_cadastros_request_event_type,
    'requester',
    v_actor,
    v_actor_name,
    jsonb_build_object('status', v_request.status),
    jsonb_build_object('status', p_status)
  );
end;
$$;

-- Internal note (staff-only visibility). Not allowed on closed requests.
create function public.gestao_cadastros_add_internal_note(p_request_id uuid, p_text text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor   bigint := private.gestao_cadastros_current_user_id();
  v_request public.gestao_cadastros_requests := private.gestao_cadastros_lock_open_request(p_request_id);
  v_text    text := btrim(coalesce(p_text, ''));
begin
  if char_length(v_text) not between 1 and 5000 then
    raise exception 'Note must have 1 to 5000 characters.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.gestao_cadastros_request_events (
    request_id, event_type, visibility, actor_id, actor_name, new_value
  )
  values (
    v_request.id, 'internal_note_added', 'internal', v_actor,
    private.gestao_cadastros_user_name(v_actor), jsonb_build_object('text', v_text)
  );
end;
$$;

comment on function public.gestao_cadastros_assign_request(uuid, bigint) is
  'GC Service Desk: assigns a request to an active operator (null = unassign). Staff only; audited.';
comment on function public.gestao_cadastros_change_request_status(uuid, public.gestao_cadastros_request_status) is
  'GC Service Desk: forward-only status change (closing records who/when). Staff only; audited.';
comment on function public.gestao_cadastros_add_internal_note(uuid, text) is
  'GC Service Desk: appends a staff-only note to an open request.';

-- -----------------------------------------------------------------------------
-- 5. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.gestao_cadastros_user_name(bigint) from public, anon, authenticated;
revoke all on function private.gestao_cadastros_lock_open_request(uuid) from public, anon, authenticated;
revoke all on function public.gestao_cadastros_operators() from public, anon;
revoke all on function public.gestao_cadastros_assign_request(uuid, bigint) from public, anon;
revoke all on function public.gestao_cadastros_change_request_status(uuid, public.gestao_cadastros_request_status) from public, anon;
revoke all on function public.gestao_cadastros_add_internal_note(uuid, text) from public, anon;

grant execute on function public.gestao_cadastros_operators() to authenticated;
grant execute on function public.gestao_cadastros_assign_request(uuid, bigint) to authenticated;
grant execute on function public.gestao_cadastros_change_request_status(uuid, public.gestao_cadastros_request_status) to authenticated;
grant execute on function public.gestao_cadastros_add_internal_note(uuid, text) to authenticated;

commit;
