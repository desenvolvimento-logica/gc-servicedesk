-- =============================================================================
-- GC Service Desk — request comments ("Observações") between requester and staff
--
-- Scope rules (docs/environment-decisions.md):
--   * Changes only objects prefixed `gestao_cadastros_` (public schema).
--   * Shared tables auth.users, public.users and public.dpto are only READ.
--
-- Decisions (approved 2026-10-19):
--   * The team does not use staff-only notes. The request page gets
--     "Observações" instead: a conversation visible to the requester and the
--     staff, written by either of them.
--   * New event type comment_added, always stored with visibility
--     'requester'. Written only through gestao_cadastros_add_comment: staff on
--     any request, requesters on their own requests. 1 to 5000 characters.
--     Closed requests accept no new comments (closed is final).
--   * Existing internal notes keep their staff-only visibility (they were
--     written under that expectation). add_internal_note is kept but no
--     longer used by the app.
--
-- Note: a value added with ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction, so this file only references it inside the function body
-- (checked when it runs). Verification runs after the commit.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- Rollback: supabase/rollbacks/20261019170000_gestao_cadastros_request_comments.down.sql
-- =============================================================================

begin;

do $$
begin
  if to_regprocedure('public.gestao_cadastros_add_internal_note(uuid, text)') is null then
    raise exception 'Migration 20261014150000 (request workflow) is not applied.';
  end if;
end;
$$;

alter type public.gestao_cadastros_request_event_type add value 'comment_added' after 'internal_note_added';

-- Comment on an open request, visible to the requester and the staff.
-- A request the caller cannot read is reported as not found.
create function public.gestao_cadastros_add_comment(p_request_id uuid, p_text text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor   bigint := private.gestao_cadastros_current_user_id();
  v_request record;
  v_text    text := btrim(coalesce(p_text, ''));
begin
  if v_actor is null or not private.gestao_cadastros_has_access() then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  select r.id, r.status, r.requester_id
    into v_request
  from public.gestao_cadastros_requests r
  where r.id = p_request_id
  for update;

  if not found or not (private.gestao_cadastros_is_staff() or v_request.requester_id = v_actor) then
    raise exception 'Request not found.' using errcode = 'no_data_found';
  end if;
  if v_request.status = 'closed' then
    raise exception 'Request is closed.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if char_length(v_text) not between 1 and 5000 then
    raise exception 'Comment must have 1 to 5000 characters.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.gestao_cadastros_request_events (
    request_id, event_type, visibility, actor_id, actor_name, new_value
  )
  values (
    v_request.id, 'comment_added', 'requester', v_actor,
    private.gestao_cadastros_user_name(v_actor), jsonb_build_object('text', v_text)
  );
end;
$$;

comment on function public.gestao_cadastros_add_comment(uuid, text) is
  'GC Service Desk: appends a requester-visible comment to an open request. Staff, or the request''s requester.';

revoke all on function public.gestao_cadastros_add_comment(uuid, text) from public, anon;
grant execute on function public.gestao_cadastros_add_comment(uuid, text) to authenticated;

commit;
