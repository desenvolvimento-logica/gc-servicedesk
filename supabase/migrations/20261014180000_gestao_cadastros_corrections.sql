-- =============================================================================
-- GC Service Desk — Phase 6: correction/rework requests
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates/alters only objects prefixed `gestao_cadastros_` (public schema)
--     and helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced. No column, trigger, policy or function is added to or
--     changed on them, and no existing function is replaced.
--
-- Decisions (approved 2026-10-14):
--   * A "Correção de Cadastro / Refazer" request always references exactly one
--     original request: CLOSED, of the SAME department, and visible to the
--     requester (their own; staff may pick any). No correction without an
--     original for now. Standard requests never reference an original.
--   * The correction snapshots the original's executing operator (assignee at
--     closing, else who closed it) for rework reporting.
--
-- Replaces public.gestao_cadastros_create_request(uuid, jsonb) (ours, Phase 4)
-- with a 3-argument version whose third argument defaults to null.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261014180000_gestao_cadastros_corrections.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.gestao_cadastros_change_request_status(uuid, public.gestao_cadastros_request_status)') is null then
    raise exception 'Phase 5 migration (20261014150000) is not applied.';
  end if;
  if exists (
    select 1 from public.gestao_cadastros_requests
    where service_kind = 'correction' and original_request_id is null
  ) then
    raise exception 'Correction requests without an original already exist; review before applying.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Columns and constraints
-- -----------------------------------------------------------------------------
alter table public.gestao_cadastros_requests
  add column original_operator_id   bigint references public.users (user_id) on delete restrict,
  add column original_operator_name text,
  add constraint gestao_cadastros_requests_correction_original_check
    check ((service_kind = 'correction') = (original_request_id is not null)),
  add constraint gestao_cadastros_requests_original_operator_check
    check (original_request_id is not null or original_operator_id is null);

comment on column public.gestao_cadastros_requests.original_operator_id is
  'Correction only: executing operator of the original request (assignee at closing, else who closed it).';

create index gestao_cadastros_requests_original_operator_idx
  on public.gestao_cadastros_requests (original_operator_id) where original_operator_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Guard: the correction link and its snapshot are immutable
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
     or new.original_operator_id   is distinct from old.original_operator_id
     or new.original_operator_name is distinct from old.original_operator_name
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
-- 3. Creation RPC with the original request (third argument)
-- -----------------------------------------------------------------------------
drop function public.gestao_cadastros_create_request(uuid, jsonb);

create function public.gestao_cadastros_create_request(
  p_service_id uuid,
  p_values jsonb,
  p_original_request_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Default length limits when the field defines no maxLength.
  c_text_max     constant integer := 500;
  c_textarea_max constant integer := 5000;

  v_user_id    bigint := private.gestao_cadastros_current_user_id();
  v_user       record;
  v_service    record;
  v_field      record;
  v_raw        jsonb;
  v_text       text;
  v_number     numeric;
  v_date       date;
  v_boolean    boolean;
  v_options    jsonb;
  v_item       jsonb;
  v_option     jsonb;
  v_empty      boolean;
  v_min_len    integer;
  v_max_len    integer;
  v_errors     jsonb := '{}'::jsonb;
  v_rows       jsonb := '[]'::jsonb;
  v_unknown    text;
  v_year       integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_seq        integer;
  v_number_txt text;
  v_request_id uuid;
  v_original   record;
  -- Set only for corrections (a record that was never assigned cannot be read).
  v_original_id       uuid;
  v_original_number   text;
  v_original_operator bigint;
begin
  if v_user_id is null then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' or pg_column_size(p_values) > 500000 then
    raise exception 'Invalid request payload.' using errcode = 'invalid_parameter_value';
  end if;

  select s.id, s.name, s.kind, s.dpto_id, d.dpto_name::text as dpto_name
    into v_service
  from public.gestao_cadastros_services s
  join public.gestao_cadastros_requester_departments rd on rd.dpto_id = s.dpto_id
  join public.dpto d on d.dpto_id = s.dpto_id
  where s.id = p_service_id and s.active and rd.active;

  if not found then
    raise exception 'Service not found or inactive.' using errcode = 'no_data_found';
  end if;

  if not private.gestao_cadastros_can_open_requests(v_service.dpto_id) then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  -- Correction/rework: exactly one closed original request of the same
  -- department, visible to the caller (own request, or any for staff).
  if v_service.kind = 'correction' then
    if p_original_request_id is null then
      raise exception 'Invalid field values.'
        using errcode = 'invalid_parameter_value',
              detail = jsonb_build_object('original_request_id', 'Selecione a solicitação original.')::text;
    end if;

    select r.id, r.request_number, r.status, r.dpto_id, r.requester_id, r.assigned_to, r.closed_by
      into v_original
    from public.gestao_cadastros_requests r
    where r.id = p_original_request_id;

    if not found
       or not (private.gestao_cadastros_is_staff() or v_original.requester_id = v_user_id)
       or v_original.dpto_id <> v_service.dpto_id
       or v_original.status <> 'closed' then
      raise exception 'Invalid field values.'
        using errcode = 'invalid_parameter_value',
              detail = jsonb_build_object('original_request_id',
                'Selecione uma solicitação concluída deste departamento.')::text;
    end if;

    -- Executing operator of the original: assignee at closing, else who closed it.
    v_original_id := v_original.id;
    v_original_number := v_original.request_number;
    v_original_operator := coalesce(v_original.assigned_to, v_original.closed_by);
  elsif p_original_request_id is not null then
    raise exception 'Only correction requests reference an original request.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Values for fields that are not active in this service are rejected.
  select k into v_unknown
  from jsonb_object_keys(p_values) as k
  where not exists (
    select 1 from public.gestao_cadastros_service_fields f
    where f.service_id = v_service.id and f.active and f.field_key = k
  )
  limit 1;

  if v_unknown is not null then
    raise exception 'Unknown field: %', v_unknown using errcode = 'invalid_parameter_value';
  end if;

  for v_field in
    select f.id, f.field_key, f.label, f.field_type, f.required, f.options, f.validation, f.sort_order
    from public.gestao_cadastros_service_fields f
    where f.service_id = v_service.id and f.active
    order by f.sort_order, f.label
  loop
    v_raw := p_values -> v_field.field_key;
    v_text := null; v_number := null; v_date := null; v_boolean := null; v_options := null;
    v_empty := v_raw is null or jsonb_typeof(v_raw) = 'null';

    begin
      if v_field.field_type = 'file' then
        raise exception 'Anexos ainda não são aceitos.';
      elsif not v_empty and v_field.field_type in ('text', 'textarea', 'email') then
        if jsonb_typeof(v_raw) <> 'string' then raise exception 'Valor inválido.'; end if;
        v_text := nullif(btrim(v_raw #>> '{}'), '');
        v_empty := v_text is null;
        if not v_empty then
          v_min_len := (v_field.validation ->> 'minLength')::integer;
          v_max_len := coalesce(
            (v_field.validation ->> 'maxLength')::integer,
            case v_field.field_type when 'textarea' then c_textarea_max else c_text_max end
          );
          if v_min_len is not null and char_length(v_text) < v_min_len then
            raise exception 'Use no mínimo % caracteres.', v_min_len;
          end if;
          if char_length(v_text) > v_max_len then
            raise exception 'Use no máximo % caracteres.', v_max_len;
          end if;
          if v_field.field_type = 'email'
             and (char_length(v_text) > 254 or v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
            raise exception 'Informe um e-mail válido.';
          end if;
        end if;
      elsif not v_empty and v_field.field_type = 'number' then
        if jsonb_typeof(v_raw) <> 'number' then raise exception 'Informe um número.'; end if;
        v_number := (v_raw #>> '{}')::numeric;
        if v_field.validation ? 'min' and v_number < (v_field.validation ->> 'min')::numeric then
          raise exception 'Informe um valor maior ou igual a %.', v_field.validation ->> 'min';
        end if;
        if v_field.validation ? 'max' and v_number > (v_field.validation ->> 'max')::numeric then
          raise exception 'Informe um valor menor ou igual a %.', v_field.validation ->> 'max';
        end if;
      elsif not v_empty and v_field.field_type = 'date' then
        if jsonb_typeof(v_raw) <> 'string' then raise exception 'Informe uma data válida.'; end if;
        v_text := nullif(btrim(v_raw #>> '{}'), '');
        v_empty := v_text is null;
        if not v_empty then
          if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Informe uma data válida.'; end if;
          begin
            v_date := v_text::date;
          exception when others then
            raise exception 'Informe uma data válida.';
          end;
          if to_char(v_date, 'YYYY-MM-DD') <> v_text then raise exception 'Informe uma data válida.'; end if;
          v_text := null;
        end if;
      elsif not v_empty and v_field.field_type = 'boolean' then
        if jsonb_typeof(v_raw) <> 'boolean' then raise exception 'Valor inválido.'; end if;
        v_boolean := (v_raw #>> '{}')::boolean;
      elsif not v_empty and v_field.field_type = 'select' then
        if jsonb_typeof(v_raw) <> 'string' then raise exception 'Selecione uma opção válida.'; end if;
        v_empty := btrim(v_raw #>> '{}') = '';
        if not v_empty then
          select o into v_option
          from jsonb_array_elements(v_field.options) o
          where o ->> 'value' = v_raw #>> '{}' and coalesce((o ->> 'active')::boolean, true);
          if v_option is null then raise exception 'Selecione uma opção válida.'; end if;
          v_options := jsonb_build_array(jsonb_build_object('value', v_option ->> 'value', 'label', v_option ->> 'label'));
          v_option := null;
        end if;
      elsif not v_empty and v_field.field_type = 'multiselect' then
        if jsonb_typeof(v_raw) <> 'array' then raise exception 'Selecione opções válidas.'; end if;
        v_options := '[]'::jsonb;
        for v_item in select e from jsonb_array_elements(v_raw) e loop
          if jsonb_typeof(v_item) <> 'string' then raise exception 'Selecione opções válidas.'; end if;
          select o into v_option
          from jsonb_array_elements(v_field.options) o
          where o ->> 'value' = v_item #>> '{}' and coalesce((o ->> 'active')::boolean, true);
          if v_option is null then raise exception 'Selecione opções válidas.'; end if;
          if not v_options @> jsonb_build_array(jsonb_build_object('value', v_option ->> 'value')) then
            v_options := v_options || jsonb_build_array(
              jsonb_build_object('value', v_option ->> 'value', 'label', v_option ->> 'label'));
          end if;
          v_option := null;
        end loop;
        if jsonb_array_length(v_options) = 0 then
          v_options := null;
          v_empty := true;
        end if;
      end if;

      if v_empty and v_field.required then
        raise exception 'Campo obrigatório.';
      end if;
    exception
      when raise_exception then
        v_errors := v_errors || jsonb_build_object(v_field.field_key, sqlerrm);
        continue;
      when invalid_text_representation or numeric_value_out_of_range then
        v_errors := v_errors || jsonb_build_object(v_field.field_key, 'Valor inválido.');
        continue;
    end;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'service_field_id', v_field.id,
      'field_key', v_field.field_key,
      'label', v_field.label,
      'field_type', v_field.field_type,
      'sort_order', v_field.sort_order,
      'value_text', v_text,
      'value_number', v_number,
      'value_date', v_date,
      'value_boolean', v_boolean,
      'value_options', v_options
    ));
  end loop;

  if v_errors <> '{}'::jsonb then
    raise exception 'Invalid field values.'
      using errcode = 'invalid_parameter_value', detail = v_errors::text;
  end if;

  if jsonb_array_length(v_rows) = 0 then
    raise exception 'Service has no active fields.' using errcode = 'invalid_parameter_value';
  end if;

  -- Requester snapshot (always the session user).
  select u.user_name::text as user_name, u.user_email::text as user_email,
         u.user_dpto, d.dpto_name::text as dpto_name
    into v_user
  from public.users u
  left join public.dpto d on d.dpto_id = u.user_dpto
  where u.user_id = v_user_id;

  -- Row lock on the year's counter serializes concurrent submissions.
  insert into public.gestao_cadastros_request_counters as c (year, last_value)
  values (v_year, 1)
  on conflict (year) do update set last_value = c.last_value + 1
  returning c.last_value into v_seq;

  v_number_txt := 'GC-' || v_year || '-' || case when v_seq < 1000000 then lpad(v_seq::text, 6, '0') else v_seq::text end;

  insert into public.gestao_cadastros_requests (
    request_number, service_id, service_name, service_kind, dpto_id, dpto_name,
    requester_id, requester_name, requester_email, requester_dpto_id, requester_dpto_name,
    company_name, company_code,
    original_request_id, original_operator_id, original_operator_name
  )
  values (
    v_number_txt, v_service.id, v_service.name, v_service.kind, v_service.dpto_id, v_service.dpto_name,
    v_user_id, v_user.user_name, v_user.user_email, v_user.user_dpto, v_user.dpto_name,
    (select r ->> 'value_text' from jsonb_array_elements(v_rows) r where r ->> 'field_key' = 'nome_empresa'),
    (select r ->> 'value_text' from jsonb_array_elements(v_rows) r where r ->> 'field_key' = 'codigo_empresa'),
    v_original_id, v_original_operator, private.gestao_cadastros_user_name(v_original_operator)
  )
  returning id into v_request_id;

  insert into public.gestao_cadastros_request_values (
    request_id, service_field_id, field_key, label, field_type, sort_order,
    value_text, value_number, value_date, value_boolean, value_options
  )
  select v_request_id,
         (r ->> 'service_field_id')::uuid,
         r ->> 'field_key',
         r ->> 'label',
         (r ->> 'field_type')::public.gestao_cadastros_field_type,
         (r ->> 'sort_order')::integer,
         r ->> 'value_text',
         (r ->> 'value_number')::numeric,
         (r ->> 'value_date')::date,
         (r ->> 'value_boolean')::boolean,
         case when jsonb_typeof(r -> 'value_options') = 'array' then r -> 'value_options' end
  from jsonb_array_elements(v_rows) r;

  insert into public.gestao_cadastros_request_events (
    request_id, event_type, visibility, actor_id, actor_name, new_value, metadata
  )
  values (
    v_request_id, 'request_created', 'requester', v_user_id, v_user.user_name,
    jsonb_build_object('status', 'open'),
    jsonb_strip_nulls(jsonb_build_object(
      'service_id', v_service.id, 'service_name', v_service.name, 'request_number', v_number_txt,
      'original_request_id', v_original_id, 'original_request_number', v_original_number))
  );

  return jsonb_build_object('id', v_request_id, 'request_number', v_number_txt);
end;
$$;

comment on function public.gestao_cadastros_create_request(uuid, jsonb, uuid) is
  'GC Service Desk: creates a request for the calling user after validating values against the active field definitions; corrections reference a closed original.';

revoke all on function public.gestao_cadastros_create_request(uuid, jsonb, uuid) from public, anon;
grant execute on function public.gestao_cadastros_create_request(uuid, jsonb, uuid) to authenticated;

commit;
