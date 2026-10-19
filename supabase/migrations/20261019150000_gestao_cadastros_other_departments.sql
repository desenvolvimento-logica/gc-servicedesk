-- =============================================================================
-- GC Service Desk — "Demais Departamentos" and the "Outros" service
--
-- Scope rules (docs/environment-decisions.md):
--   * Changes only objects prefixed `gestao_cadastros_` (public schema) and
--     helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced. Nothing is inserted into public.dpto.
--
-- Decisions (approved 2026-10-19):
--   * "Demais Departamentos" is a GC-only (virtual) requester department:
--     a gestao_cadastros_requester_departments row with catch_all = true,
--     its own name and dpto_id -1. Corporate departments keep positive ids
--     and their foreign key to public.dpto (now through corporate_dpto_id).
--   * Members of corporate departments that are NOT registered as requester
--     departments (active or not) may open requests in it. Users without a
--     department get no access. Deactivating the row removes that access.
--     Requesters still see only their own requests (RLS unchanged).
--   * Service "Outros" in Fiscal, Departamento Pessoal, Contábil and Demais
--     Departamentos: Nome/Código da empresa (optional), Descrição da
--     solicitação (required), Observações. No correction service in Demais
--     Departamentos.
--   * Functions are replaced with the same signatures (grants are kept).
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261019150000_gestao_cadastros_other_departments.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.gestao_cadastros_company_sync_runs') is null then
    raise exception 'Migration 20261015150000 (companies) is not applied.';
  end if;

  if exists (select 1 from public.gestao_cadastros_requester_departments where dpto_id <= 0) then
    raise exception 'A requester department with a non-positive id already exists. Review before applying.';
  end if;

  if (
    select count(*) from public.gestao_cadastros_requester_departments rd
    join public.dpto d on d.dpto_id = rd.dpto_id
    where d.dpto_name in ('Fiscal', 'Departamento Pessoal', 'Contábil')
  ) <> 3 then
    raise exception 'Expected the Fiscal, Departamento Pessoal and Contábil requester departments.';
  end if;

  if exists (
    select 1 from public.gestao_cadastros_services s
    join public.dpto d on d.dpto_id = s.dpto_id
    where d.dpto_name in ('Fiscal', 'Departamento Pessoal', 'Contábil') and lower(s.name) = 'outros'
  ) then
    raise exception 'A service named "Outros" already exists. Review before applying.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Requester departments: corporate rows or the GC catch-all
-- -----------------------------------------------------------------------------
alter table public.gestao_cadastros_requester_departments
  add column name      text,
  add column catch_all boolean not null default false;

-- The foreign key to public.dpto moves to a generated column that is NULL for
-- the catch-all row (same ON DELETE CASCADE as before for corporate rows).
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.gestao_cadastros_requester_departments'::regclass
    and c.confrelid = 'public.dpto'::regclass
    and c.contype = 'f';

  if v_constraint is null then
    raise exception 'Foreign key from gestao_cadastros_requester_departments to public.dpto not found.';
  end if;

  execute format('alter table public.gestao_cadastros_requester_departments drop constraint %I', v_constraint);
end;
$$;

alter table public.gestao_cadastros_requester_departments
  add column corporate_dpto_id bigint
    generated always as (case when catch_all then null else dpto_id end) stored;

alter table public.gestao_cadastros_requester_departments
  add constraint gestao_cadastros_requester_departments_corporate_dpto_fkey
    foreign key (corporate_dpto_id) references public.dpto (dpto_id) on delete cascade,
  add constraint gestao_cadastros_requester_departments_kind_check
    check (
      (catch_all and dpto_id < 0 and name is not null and btrim(name) <> '')
      or (not catch_all and dpto_id > 0 and name is null)
    );

create unique index gestao_cadastros_requester_departments_catch_all_key
  on public.gestao_cadastros_requester_departments (catch_all)
  where catch_all;

comment on table public.gestao_cadastros_requester_departments is
  'Departments whose members may open GC Service Desk requests: corporate (public.dpto) or the GC catch-all "Demais Departamentos".';
comment on column public.gestao_cadastros_requester_departments.catch_all is
  'GC-only department for members of corporate departments that are not requester departments.';

-- Administrators keep the column grants of the catalog phase (insert dpto_id,
-- active, sort_order; update active, sort_order): they cannot create
-- catch-all rows or rename them.

-- -----------------------------------------------------------------------------
-- 2. Authorization helpers
-- -----------------------------------------------------------------------------

-- Whether members of corporate department p_dpto_id belong to the active
-- catch-all: their department is not registered as a requester department.
create function private.gestao_cadastros_in_catch_all(p_dpto_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_dpto_id is not null
     and not exists (
       select 1 from public.gestao_cadastros_requester_departments d
       where d.dpto_id = p_dpto_id and not d.catch_all
     )
     and exists (
       select 1 from public.gestao_cadastros_requester_departments d
       where d.catch_all and d.active
     );
$$;

-- Only called from the SECURITY DEFINER functions below.
revoke all on function private.gestao_cadastros_in_catch_all(bigint) from public, anon, authenticated;

-- Member of an active corporate requester department, or of the catch-all.
create or replace function private.gestao_cadastros_is_requester()
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
             and not d.catch_all
             and d.active
         )
      or private.gestao_cadastros_in_catch_all(private.gestao_cadastros_current_user_dpto());
$$;

-- Whether the caller may open a request on behalf of department p_dpto_id:
-- staff -> any active requester department; requester -> their own, or the
-- catch-all when their department is not a requester department.
create or replace function private.gestao_cadastros_can_open_requests(p_dpto_id bigint)
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
        or (not d.catch_all and d.dpto_id = private.gestao_cadastros_current_user_dpto())
        or (d.catch_all and private.gestao_cadastros_in_catch_all(private.gestao_cadastros_current_user_dpto()))
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Department names (the catch-all has no public.dpto row)
-- -----------------------------------------------------------------------------
create or replace function public.gestao_cadastros_my_profile()
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
      select jsonb_agg(jsonb_build_object('id', rd.dpto_id, 'name', coalesce(rd.name, d2.dpto_name::text))
                       order by rd.sort_order, coalesce(rd.name, d2.dpto_name::text))
      from public.gestao_cadastros_requester_departments rd
      left join public.dpto d2 on d2.dpto_id = rd.dpto_id
      where private.gestao_cadastros_can_open_requests(rd.dpto_id)
    ), '[]'::jsonb)
  )
  from me
  left join public.dpto d on d.dpto_id = me.user_dpto;
$$;

create or replace function public.gestao_cadastros_admin_departments()
returns table (
  id                      bigint,
  name                    text,
  is_requester_department boolean,
  active                  boolean,
  sort_order              integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.gestao_cadastros_has_role('administrator') then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  -- Corporate departments, then the GC catch-all ("Demais Departamentos").
  return query
    select q.id, q.name, q.is_requester_department, q.active, q.sort_order
    from (
      select d.dpto_id as id,
             d.dpto_name::text as name,
             rd.dpto_id is not null as is_requester_department,
             coalesce(rd.active, false) as active,
             coalesce(rd.sort_order, 0) as sort_order,
             0 as grp
      from public.dpto d
      left join public.gestao_cadastros_requester_departments rd
        on rd.dpto_id = d.dpto_id and not rd.catch_all
      union all
      select rd.dpto_id, rd.name, true, rd.active, rd.sort_order, 1
      from public.gestao_cadastros_requester_departments rd
      where rd.catch_all
    ) q
    order by q.grp, q.name;
end;
$$;

create or replace function public.gestao_cadastros_admin_users()
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
             where rd.dpto_id = u.user_dpto and not rd.catch_all and rd.active
           ) or private.gestao_cadastros_in_catch_all(u.user_dpto),
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

create or replace function public.gestao_cadastros_create_request(
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

  select s.id, s.name, s.kind, s.dpto_id, coalesce(rd.name, d.dpto_name::text) as dpto_name
    into v_service
  from public.gestao_cadastros_services s
  join public.gestao_cadastros_requester_departments rd on rd.dpto_id = s.dpto_id
  left join public.dpto d on d.dpto_id = s.dpto_id
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

-- -----------------------------------------------------------------------------
-- 4. Data: the catch-all department and the "Outros" services
-- -----------------------------------------------------------------------------
insert into public.gestao_cadastros_requester_departments (dpto_id, name, catch_all, active, sort_order)
select -1, 'Demais Departamentos', true, true, coalesce(max(sort_order), 0) + 10
from public.gestao_cadastros_requester_departments;

-- Single statement (no temporary tables), as in the catalog seed.
with targets as (
  select rd.dpto_id
  from public.gestao_cadastros_requester_departments rd
  left join public.dpto d on d.dpto_id = rd.dpto_id
  where rd.catch_all or d.dpto_name in ('Fiscal', 'Departamento Pessoal', 'Contábil')
),
inserted_services as (
  insert into public.gestao_cadastros_services (dpto_id, name, description, kind, sort_order)
  select t.dpto_id, 'Outros', 'Solicitações que não se encaixam nos demais serviços.', 'standard', 800
  from targets t
  returning id
)
insert into public.gestao_cadastros_service_fields
  (service_id, field_key, label, field_type, required, active, help_text, sort_order)
select sv.id, f.field_key, f.label, f.field_type::public.gestao_cadastros_field_type,
       f.required, true, f.help_text, f.sort_order
from inserted_services sv
cross join (values
  ('nome_empresa',          'Nome da empresa',          'text',     false, null::text,                          10),
  ('codigo_empresa',        'Código da empresa',        'text',     false, null::text,                          20),
  ('descricao_solicitacao', 'Descrição da solicitação', 'textarea', true,  'Descreva o que precisa ser feito.', 30),
  ('observacoes',           'Observações',              'textarea', false, null::text,                          40)
) as f (field_key, label, field_type, required, help_text, sort_order);

do $$
declare
  services_total integer;
  fields_total   integer;
begin
  select count(*) into services_total from public.gestao_cadastros_services where name = 'Outros';
  select count(*) into fields_total
  from public.gestao_cadastros_service_fields f
  join public.gestao_cadastros_services s on s.id = f.service_id
  where s.name = 'Outros';
  if services_total <> 4 or fields_total <> 16 then
    raise exception 'Seed mismatch: expected 4 "Outros" services / 16 fields, got % / %.', services_total, fields_total;
  end if;
end;
$$;

commit;
