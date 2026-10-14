-- =============================================================================
-- GC Service Desk — Phase 4: requests, submitted values and request history
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates only objects prefixed `gestao_cadastros_` (public schema) and
--     helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced. No column, trigger, policy or function is added to or
--     changed on them, and no existing function is replaced.
--
-- Decisions (approved 2026-10-14):
--   * Request number `GC-YYYY-NNNNNN`, sequence restarting every year
--     (America/Sao_Paulo calendar year).
--   * Status is an enum: open / in_progress / closed.
--   * The requester is always the signed-in user (staff open requests for
--     themselves); the request department is the selected service's department.
--   * References to public.users are ON DELETE RESTRICT: a corporate user with
--     requests/history cannot be deleted (offboarding = disable in Entra ID).
--   * Attachments are deferred: `file` fields are rejected on submission.
--
-- Historical integrity: a request keeps snapshots of the service, departments,
-- requester and of every submitted field (key, label, type, order, option
-- labels), so later catalog edits never change what was submitted. Submitted
-- values and history events are append-only (guard triggers; no grants).
--
-- Writes: authenticated users only SELECT (under RLS). Requests are created
-- exclusively through public.gestao_cadastros_create_request(), which derives
-- the requester from the session and re-validates every value against the
-- current active field definitions.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261014120000_gestao_cadastros_requests.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.gestao_cadastros_service_fields') is null then
    raise exception 'Phase 3 migration (20261013180000) is not applied.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.gestao_cadastros_request_status as enum ('open', 'in_progress', 'closed');

comment on type public.gestao_cadastros_request_status is
  'open = Aberta; in_progress = Em andamento; closed = Concluída (final: never reopened).';

-- Full vocabulary from specs/08 so later phases only append events.
create type public.gestao_cadastros_request_event_type as enum (
  'request_created',
  'status_changed',
  'assigned',
  'unassigned',
  'internal_note_added',
  'request_closed',
  'attachment_added'
);

create type public.gestao_cadastros_event_visibility as enum ('requester', 'internal');

comment on type public.gestao_cadastros_event_visibility is
  'requester = shown to the requester and staff; internal = staff only (never returned to requesters).';

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- Per-year counter behind the request number. Only the creation RPC touches it.
create table public.gestao_cadastros_request_counters (
  year       integer primary key check (year between 2000 and 9999),
  last_value integer not null check (last_value >= 0)
);

comment on table public.gestao_cadastros_request_counters is
  'GC Service Desk: last request sequence number per year (GC-YYYY-NNNNNN).';

create table public.gestao_cadastros_requests (
  id                  uuid primary key default gen_random_uuid(),
  request_number      text not null unique check (request_number ~ '^GC-[0-9]{4}-[0-9]{6,}$'),

  -- Service and its department; names/kind are snapshots taken at submission.
  service_id          uuid not null references public.gestao_cadastros_services (id) on delete restrict,
  service_name        text not null,
  service_kind        public.gestao_cadastros_service_kind not null,
  dpto_id             bigint not null
                      references public.gestao_cadastros_requester_departments (dpto_id) on delete restrict,
  dpto_name           text not null,

  -- Requester: always the session user. Name/e-mail/department are snapshots;
  -- requester_dpto_id has no FK on purpose (historical value only).
  requester_id        bigint not null references public.users (user_id) on delete restrict,
  requester_name      text,
  requester_email     text,
  requester_dpto_id   bigint,
  requester_dpto_name text,

  status              public.gestao_cadastros_request_status not null default 'open',
  assigned_to         bigint references public.users (user_id) on delete restrict,
  -- Correction/rework link (Phase 6).
  original_request_id uuid references public.gestao_cadastros_requests (id) on delete restrict,

  -- Copied from the submitted "nome_empresa"/"codigo_empresa" values, when the
  -- service has them, for queue search and reporting.
  company_name        text,
  company_code        text,

  opened_at           timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,

  constraint gestao_cadastros_requests_completed_check
    check ((status = 'closed') = (completed_at is not null)),
  constraint gestao_cadastros_requests_not_self_original_check
    check (original_request_id is null or original_request_id <> id)
);

comment on table public.gestao_cadastros_requests is
  'GC Service Desk: one request = exactly one service. Never deleted.';

create index gestao_cadastros_requests_requester_opened_idx
  on public.gestao_cadastros_requests (requester_id, opened_at desc);
create index gestao_cadastros_requests_status_opened_idx
  on public.gestao_cadastros_requests (status, opened_at desc);
create index gestao_cadastros_requests_dpto_opened_idx
  on public.gestao_cadastros_requests (dpto_id, opened_at desc);
create index gestao_cadastros_requests_service_idx
  on public.gestao_cadastros_requests (service_id);
create index gestao_cadastros_requests_assigned_idx
  on public.gestao_cadastros_requests (assigned_to) where assigned_to is not null;
create index gestao_cadastros_requests_original_idx
  on public.gestao_cadastros_requests (original_request_id) where original_request_id is not null;
create index gestao_cadastros_requests_completed_idx
  on public.gestao_cadastros_requests (completed_at) where completed_at is not null;
create index gestao_cadastros_requests_company_code_idx
  on public.gestao_cadastros_requests (company_code) where company_code is not null;

-- One row per field that was active when the request was submitted (empty
-- optional fields included, with every value column null).
create table public.gestao_cadastros_request_values (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references public.gestao_cadastros_requests (id) on delete restrict,
  service_field_id uuid not null references public.gestao_cadastros_service_fields (id) on delete restrict,

  -- Snapshot of the field definition at submission.
  field_key        text not null,
  label            text not null,
  field_type       public.gestao_cadastros_field_type not null,
  sort_order       integer not null,

  -- Typed value: only the column matching field_type may be set.
  value_text       text check (value_text is null or char_length(value_text) <= 100000),
  value_number     numeric,
  value_date       date,
  value_boolean    boolean,
  -- select/multiselect: [{ "value": "...", "label": "..." }] (label snapshot).
  value_options    jsonb check (value_options is null or jsonb_typeof(value_options) = 'array'),

  created_at       timestamptz not null default now(),

  constraint gestao_cadastros_request_values_request_field_key unique (request_id, service_field_id),
  constraint gestao_cadastros_request_values_typed_check check (
    case field_type
      when 'text'        then num_nonnulls(value_number, value_date, value_boolean, value_options) = 0
      when 'textarea'    then num_nonnulls(value_number, value_date, value_boolean, value_options) = 0
      when 'email'       then num_nonnulls(value_number, value_date, value_boolean, value_options) = 0
      when 'number'      then num_nonnulls(value_text, value_date, value_boolean, value_options) = 0
      when 'date'        then num_nonnulls(value_text, value_number, value_boolean, value_options) = 0
      when 'boolean'     then num_nonnulls(value_text, value_number, value_date, value_options) = 0
      when 'select'      then num_nonnulls(value_text, value_number, value_date, value_boolean) = 0
      when 'multiselect' then num_nonnulls(value_text, value_number, value_date, value_boolean) = 0
      else num_nonnulls(value_text, value_number, value_date, value_boolean, value_options) = 0
    end
  )
);

comment on table public.gestao_cadastros_request_values is
  'GC Service Desk: submitted field values with a snapshot of each field definition. Append-only.';

create index gestao_cadastros_request_values_request_order_idx
  on public.gestao_cadastros_request_values (request_id, sort_order);
create index gestao_cadastros_request_values_field_idx
  on public.gestao_cadastros_request_values (service_field_id);

create table public.gestao_cadastros_request_events (
  id             bigint generated always as identity primary key,
  request_id     uuid not null references public.gestao_cadastros_requests (id) on delete restrict,
  event_type     public.gestao_cadastros_request_event_type not null,
  visibility     public.gestao_cadastros_event_visibility not null default 'requester',
  actor_id       bigint not null references public.users (user_id) on delete restrict,
  actor_name     text,
  previous_value jsonb,
  new_value      jsonb,
  metadata       jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at     timestamptz not null default now(),
  constraint gestao_cadastros_request_events_note_internal_check
    check (event_type <> 'internal_note_added' or visibility = 'internal')
);

comment on table public.gestao_cadastros_request_events is
  'GC Service Desk: append-only request history. Internal events are never shown to requesters.';

create index gestao_cadastros_request_events_request_idx
  on public.gestao_cadastros_request_events (request_id, created_at, id);

-- -----------------------------------------------------------------------------
-- 3. Triggers: timestamps, immutable snapshots, append-only history
-- -----------------------------------------------------------------------------
create trigger gestao_cadastros_requests_set_updated_at
  before update on public.gestao_cadastros_requests
  for each row execute function private.gestao_cadastros_set_updated_at();

create function private.gestao_cadastros_guard_request_update()
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
  return new;
end;
$$;

create trigger gestao_cadastros_requests_guard
  before update on public.gestao_cadastros_requests
  for each row execute function private.gestao_cadastros_guard_request_update();

-- Requests, submitted values and events are never deleted; values and events
-- are never updated either. Applies to every role, including the service role.
create function private.gestao_cadastros_reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on % is not allowed: request history is permanent.', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger gestao_cadastros_requests_no_delete
  before delete on public.gestao_cadastros_requests
  for each row execute function private.gestao_cadastros_reject_change();

create trigger gestao_cadastros_request_values_append_only
  before update or delete on public.gestao_cadastros_request_values
  for each row execute function private.gestao_cadastros_reject_change();

create trigger gestao_cadastros_request_events_append_only
  before update or delete on public.gestao_cadastros_request_events
  for each row execute function private.gestao_cadastros_reject_change();

-- -----------------------------------------------------------------------------
-- 4. Visibility helper for RLS
-- -----------------------------------------------------------------------------
create function private.gestao_cadastros_can_read_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.gestao_cadastros_is_staff()
      or exists (
        select 1
        from public.gestao_cadastros_requests r
        where r.id = p_request_id
          and r.requester_id = private.gestao_cadastros_current_user_id()
      );
$$;

-- -----------------------------------------------------------------------------
-- 5. Creation RPC
--    p_values: JSON object keyed by field_key. Accepted shapes per type:
--      text/textarea/email/date/select -> string; number -> number;
--      boolean -> boolean; multiselect -> array of strings; empty -> null/absent.
--    Validation failures raise SQLSTATE 22023 with a JSON object
--    { field_key: message } in DETAIL. Messages are user-facing (pt-BR).
-- -----------------------------------------------------------------------------
create function public.gestao_cadastros_create_request(p_service_id uuid, p_values jsonb)
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
    company_name, company_code
  )
  values (
    v_number_txt, v_service.id, v_service.name, v_service.kind, v_service.dpto_id, v_service.dpto_name,
    v_user_id, v_user.user_name, v_user.user_email, v_user.user_dpto, v_user.dpto_name,
    (select r ->> 'value_text' from jsonb_array_elements(v_rows) r where r ->> 'field_key' = 'nome_empresa'),
    (select r ->> 'value_text' from jsonb_array_elements(v_rows) r where r ->> 'field_key' = 'codigo_empresa')
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
    jsonb_build_object('service_id', v_service.id, 'service_name', v_service.name, 'request_number', v_number_txt)
  );

  return jsonb_build_object('id', v_request_id, 'request_number', v_number_txt);
end;
$$;

comment on function public.gestao_cadastros_create_request(uuid, jsonb) is
  'GC Service Desk: creates a request for the calling user after validating values against the active field definitions.';

-- -----------------------------------------------------------------------------
-- 6. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.gestao_cadastros_guard_request_update() from public, anon, authenticated;
revoke all on function private.gestao_cadastros_reject_change() from public, anon, authenticated;
revoke all on function private.gestao_cadastros_can_read_request(uuid) from public, anon;
revoke all on function public.gestao_cadastros_create_request(uuid, jsonb) from public, anon;
grant execute on function private.gestao_cadastros_can_read_request(uuid) to authenticated;
grant execute on function public.gestao_cadastros_create_request(uuid, jsonb) to authenticated;

-- Read-only for the app; every write goes through the RPC above.
revoke all on table public.gestao_cadastros_request_counters from anon, authenticated;
revoke all on table public.gestao_cadastros_requests from anon, authenticated;
revoke all on table public.gestao_cadastros_request_values from anon, authenticated;
revoke all on table public.gestao_cadastros_request_events from anon, authenticated;
grant select on table public.gestao_cadastros_requests to authenticated;
grant select on table public.gestao_cadastros_request_values to authenticated;
grant select on table public.gestao_cadastros_request_events to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.gestao_cadastros_request_counters enable row level security;
alter table public.gestao_cadastros_requests enable row level security;
alter table public.gestao_cadastros_request_values enable row level security;
alter table public.gestao_cadastros_request_events enable row level security;

-- Counters: no policies (no access through the Data API).

-- Staff sees every request; a requester sees only their own.
create policy gestao_cadastros_requests_select
  on public.gestao_cadastros_requests
  for select
  to authenticated
  using (
    (select private.gestao_cadastros_is_staff())
    or requester_id = (select private.gestao_cadastros_current_user_id())
  );

create policy gestao_cadastros_request_values_select
  on public.gestao_cadastros_request_values
  for select
  to authenticated
  using (private.gestao_cadastros_can_read_request(request_id));

-- Internal events (e.g. operator notes) are staff-only.
create policy gestao_cadastros_request_events_select
  on public.gestao_cadastros_request_events
  for select
  to authenticated
  using (
    (select private.gestao_cadastros_is_staff())
    or (visibility = 'requester' and private.gestao_cadastros_can_read_request(request_id))
  );

commit;
