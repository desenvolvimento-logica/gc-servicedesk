-- Read-only verification for 20261019170000_gestao_cadastros_request_comments.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. A failed check raises an error ("... FAILED"). Writing blocks are rolled back.

-- 1. Objects and privileges -----------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'enum_has_comment_added', exists (
    select 1 from pg_enum e
    where e.enumtypid = 'public.gestao_cadastros_request_event_type'::regtype and e.enumlabel = 'comment_added'
  ),
  'authenticated_can_execute',
    has_function_privilege('authenticated', 'public.gestao_cadastros_add_comment(uuid, text)', 'EXECUTE'),
  'anon_can_execute',
    has_function_privilege('anon', 'public.gestao_cadastros_add_comment(uuid, text)', 'EXECUTE'),
  'authenticated_can_insert_events',
    has_table_privilege('authenticated', 'public.gestao_cadastros_request_events', 'INSERT')
));
-- Expected: enum_has_comment_added true; authenticated_can_execute true;
-- anon_can_execute false; authenticated_can_insert_events false.

-- 2. Requester comments on their own request; another user cannot; staff reads it
-- Requester: a linked user from another department (opens an "Outros" request
-- in Demais Departamentos). Other user: a second such user. Staff: the first
-- active operator. Everything is rolled back.
begin;
select set_config('gc_check.requester', min(auth_user_id::text), true),
       set_config('gc_check.other', max(auth_user_id::text), true)
from (
  select u.auth_user_id
  from public.users u
  where u.auth_user_id is not null
    and u.user_dpto is not null
    and not exists (select 1 from public.gestao_cadastros_requester_departments rd where rd.dpto_id = u.user_dpto)
    and not exists (select 1 from public.gestao_cadastros_user_roles r where r.user_id = u.user_id and r.active)
  order by u.user_id
  limit 2
) candidates;
select set_config('gc_check.staff', u.auth_user_id::text, true)
from public.users u
join public.gestao_cadastros_user_roles r on r.user_id = u.user_id and r.active and r.role = 'operator'
where u.auth_user_id is not null
order by u.user_id
limit 1;
select set_config('gc_check.outros', s.id::text, true)
from public.gestao_cadastros_services s
where s.dpto_id = -1 and s.name = 'Outros';
set local role authenticated;
do $$
declare
  v_request uuid;
  v_count   integer;
begin
  if current_setting('gc_check.requester', true) is null
     or current_setting('gc_check.requester') = current_setting('gc_check.other') then
    raise exception 'SETUP FAILED: two linked users from other departments are needed.';
  end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('gc_check.requester'), 'role', 'authenticated')::text, true);
  v_request := (public.gestao_cadastros_create_request(
    current_setting('gc_check.outros')::uuid,
    jsonb_build_object('descricao_solicitacao', 'Verificação de observações')) ->> 'id')::uuid;
  if v_request is null then
    raise exception 'SETUP FAILED: create_request returned no id.';
  end if;

  perform public.gestao_cadastros_add_comment(v_request, '  Comentário do solicitante  ');

  begin
    perform public.gestao_cadastros_add_comment(v_request, '   ');
    raise exception 'VALIDATION FAILED: empty comment accepted.';
  exception when invalid_parameter_value then null;
  end;

  -- Another user can neither comment nor read it.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('gc_check.other'), 'role', 'authenticated')::text, true);
  begin
    perform public.gestao_cadastros_add_comment(v_request, 'Intruso');
    raise exception 'AUTH FAILED: another user commented.';
  exception when no_data_found then null;
  end;
  if exists (select 1 from public.gestao_cadastros_request_events where request_id = v_request) then
    raise exception 'AUTH FAILED: another user reads the events.';
  end if;

  -- Staff comments too and sees both comments.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('gc_check.staff'), 'role', 'authenticated')::text, true);
  perform public.gestao_cadastros_add_comment(v_request, 'Resposta da equipe');

  -- Back to the requester: sees both comments, trimmed.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('gc_check.requester'), 'role', 'authenticated')::text, true);
  select count(*) into v_count
  from public.gestao_cadastros_request_events
  where request_id = v_request
    and event_type::text = 'comment_added'
    and visibility = 'requester'
    and new_value ->> 'text' in ('Comentário do solicitante', 'Resposta da equipe');
  if v_count <> 2 then
    raise exception 'READ FAILED: requester sees % of 2 comments.', v_count;
  end if;
end;
$$;
select 'OK: requester and staff comment; others cannot' as result;
rollback;
-- Expected: "OK: requester and staff comment; others cannot".
