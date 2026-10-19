-- Rollback for 20261019150000_gestao_cadastros_other_departments.sql
-- Restores the previous function definitions and removes the catch-all
-- department and the "Outros" services. Aborts if any request already uses
-- them: request history is permanent (deactivate them in the catalog instead).

begin;

do $$
begin
  if exists (
    select 1 from public.gestao_cadastros_requests r
    join public.gestao_cadastros_services s on s.id = r.service_id
    where s.name = 'Outros' or r.dpto_id < 0
  ) then
    raise exception 'Requests already use "Outros" or "Demais Departamentos": deactivate them instead of rolling back.';
  end if;
end;
$$;

delete from public.gestao_cadastros_service_fields f
using public.gestao_cadastros_services s
where s.id = f.service_id and s.name = 'Outros';
delete from public.gestao_cadastros_services where name = 'Outros';
delete from public.gestao_cadastros_requester_departments where catch_all;

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
      and d.active
  );
$$;

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
        or d.dpto_id = private.gestao_cadastros_current_user_dpto()
      )
  );
$$;

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

  return query
    select d.dpto_id,
           d.dpto_name::text,
           rd.dpto_id is not null,
           coalesce(rd.active, false),
           coalesce(rd.sort_order, 0)
    from public.dpto d
    left join public.gestao_cadastros_requester_departments rd on rd.dpto_id = d.dpto_id
    order by d.dpto_name;
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

drop function private.gestao_cadastros_in_catch_all(bigint);

drop index public.gestao_cadastros_requester_departments_catch_all_key;
alter table public.gestao_cadastros_requester_departments
  drop constraint gestao_cadastros_requester_departments_kind_check,
  drop constraint gestao_cadastros_requester_departments_corporate_dpto_fkey,
  drop column corporate_dpto_id,
  drop column catch_all,
  drop column name;

alter table public.gestao_cadastros_requester_departments
  add constraint gestao_cadastros_requester_departments_dpto_id_fkey
    foreign key (dpto_id) references public.dpto (dpto_id) on delete cascade;

comment on table public.gestao_cadastros_requester_departments is
  'Corporate departments (public.dpto) whose members may open GC Service Desk requests.';

commit;
