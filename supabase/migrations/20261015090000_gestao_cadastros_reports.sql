-- =============================================================================
-- GC Service Desk — Phase 7: reporting and export
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates only objects prefixed `gestao_cadastros_` (public schema).
--   * Shared tables auth.users, public.users and public.dpto are not touched.
--
-- Decisions (approved 2026-10-14):
--   * Reports and CSV export: operators and administrators.
--   * Base set: requests OPENED in the period [p_from, p_to] (inclusive
--     calendar dates, America/Sao_Paulo). Resolution time is measured on the
--     closed requests of that set (completed_at - opened_at).
--   * Optional filters: department, service, kind (standard / correction).
--
-- Both functions are SECURITY INVOKER (RLS still applies) and read-only; they
-- also reject callers that are not staff.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261015090000_gestao_cadastros_reports.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.gestao_cadastros_create_request(uuid, jsonb, uuid)') is null then
    raise exception 'Phase 6 migration (20261014180000) is not applied.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Indexes for the report/queue query shapes (period first)
-- -----------------------------------------------------------------------------
create index gestao_cadastros_requests_opened_idx
  on public.gestao_cadastros_requests (opened_at desc);
create index gestao_cadastros_requests_service_opened_idx
  on public.gestao_cadastros_requests (service_id, opened_at desc);
-- Superseded by the composite index above.
drop index public.gestao_cadastros_requests_service_idx;

-- -----------------------------------------------------------------------------
-- 2. Shared filter: requests of the report base set
-- -----------------------------------------------------------------------------
create function private.gestao_cadastros_report_base(
  p_from date,
  p_to date,
  p_dpto_id bigint,
  p_service_id uuid,
  p_kind public.gestao_cadastros_service_kind
)
returns setof public.gestao_cadastros_requests
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.gestao_cadastros_is_staff() then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 731 then
    raise exception 'Invalid period (at most two years).' using errcode = 'invalid_parameter_value';
  end if;

  return query
    select r.*
    from public.gestao_cadastros_requests r
    where r.opened_at >= (p_from::timestamp at time zone 'America/Sao_Paulo')
      and r.opened_at <  ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_dpto_id is null or r.dpto_id = p_dpto_id)
      and (p_service_id is null or r.service_id = p_service_id)
      and (p_kind is null or r.service_kind = p_kind);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Indicators
-- -----------------------------------------------------------------------------
create function public.gestao_cadastros_report_summary(
  p_from date,
  p_to date,
  p_dpto_id bigint default null,
  p_service_id uuid default null,
  p_kind public.gestao_cadastros_service_kind default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select r.*,
           extract(epoch from (r.completed_at - r.opened_at)) / 3600.0 as hours
    from private.gestao_cadastros_report_base(p_from, p_to, p_dpto_id, p_service_id, p_kind) r
  ),
  corrections as (
    select b.original_operator_name, o.service_name as original_service_name
    from base b
    left join public.gestao_cadastros_requests o on o.id = b.original_request_id
    where b.service_kind = 'correction'
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_status', jsonb_build_object(
      'open',        (select count(*) from base where status = 'open'),
      'in_progress', (select count(*) from base where status = 'in_progress'),
      'closed',      (select count(*) from base where status = 'closed')
    ),
    'avg_resolution_hours', (select round(avg(hours)::numeric, 1) from base where status = 'closed'),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.dpto_name, 'total', x.total) order by x.total desc, x.dpto_name)
      from (select dpto_name, count(*) as total from base group by dpto_name) x
    ), '[]'::jsonb),
    'by_service', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.service_name, 'department', x.dpto_name, 'total', x.total,
               'closed', x.closed, 'avg_resolution_hours', x.avg_hours)
             order by x.total desc, x.service_name)
      from (
        select service_name, dpto_name, count(*) as total,
               count(*) filter (where status = 'closed') as closed,
               round(avg(hours) filter (where status = 'closed')::numeric, 1) as avg_hours
        from base group by service_name, dpto_name
      ) x
    ), '[]'::jsonb),
    'by_operator', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', x.name, 'total', x.total, 'closed', x.closed, 'avg_resolution_hours', x.avg_hours)
             order by x.name is null, x.total desc, x.name)
      from (
        select assigned_to_name as name, count(*) as total,
               count(*) filter (where status = 'closed') as closed,
               round(avg(hours) filter (where status = 'closed')::numeric, 1) as avg_hours
        from base group by assigned_to, assigned_to_name
      ) x
    ), '[]'::jsonb),
    'rework', jsonb_build_object(
      'corrections', (select count(*) from corrections),
      'by_original_operator', coalesce((
        select jsonb_agg(jsonb_build_object('name', x.name, 'total', x.total) order by x.name is null, x.total desc, x.name)
        from (select original_operator_name as name, count(*) as total from corrections group by original_operator_name) x
      ), '[]'::jsonb),
      'by_original_service', coalesce((
        select jsonb_agg(jsonb_build_object('name', x.name, 'total', x.total) order by x.total desc, x.name)
        from (select original_service_name as name, count(*) as total from corrections group by original_service_name) x
      ), '[]'::jsonb)
    )
  );
$$;

comment on function public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind) is
  'GC Service Desk: report indicators for requests opened in the period. Staff only.';

-- -----------------------------------------------------------------------------
-- 4. Export rows (paged; the app pages with p_offset/p_limit <= 1000)
--    field_values: submitted values with their field snapshot, when requested.
-- -----------------------------------------------------------------------------
create function public.gestao_cadastros_report_requests(
  p_from date,
  p_to date,
  p_dpto_id bigint default null,
  p_service_id uuid default null,
  p_kind public.gestao_cadastros_service_kind default null,
  p_include_values boolean default false,
  p_offset integer default 0,
  p_limit integer default 1000
)
returns table (
  id                      uuid,
  request_number          text,
  service_kind            public.gestao_cadastros_service_kind,
  dpto_name               text,
  service_name            text,
  company_name            text,
  company_code            text,
  status                  public.gestao_cadastros_request_status,
  requester_name          text,
  requester_email         text,
  assigned_to_name        text,
  opened_at               timestamptz,
  completed_at            timestamptz,
  closed_by_name          text,
  original_request_number text,
  original_operator_name  text,
  field_values            jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_offset < 0 or p_limit not between 1 and 1000 then
    raise exception 'Invalid page.' using errcode = 'invalid_parameter_value';
  end if;

  return query
    select b.id, b.request_number, b.service_kind, b.dpto_name, b.service_name,
           b.company_name, b.company_code, b.status, b.requester_name, b.requester_email,
           b.assigned_to_name, b.opened_at, b.completed_at, b.closed_by_name,
           o.request_number, b.original_operator_name,
           case when p_include_values then coalesce((
             select jsonb_agg(jsonb_build_object(
                      'field_key', v.field_key, 'label', v.label, 'field_type', v.field_type,
                      'sort_order', v.sort_order, 'value_text', v.value_text,
                      'value_number', v.value_number, 'value_date', v.value_date,
                      'value_boolean', v.value_boolean, 'value_options', v.value_options)
                    order by v.sort_order)
             from public.gestao_cadastros_request_values v
             where v.request_id = b.id
           ), '[]'::jsonb) end
    from private.gestao_cadastros_report_base(p_from, p_to, p_dpto_id, p_service_id, p_kind) b
    left join public.gestao_cadastros_requests o on o.id = b.original_request_id
    order by b.opened_at, b.id
    offset p_offset
    limit p_limit;
end;
$$;

comment on function public.gestao_cadastros_report_requests(date, date, bigint, uuid, public.gestao_cadastros_service_kind, boolean, integer, integer) is
  'GC Service Desk: report rows (CSV export) for requests opened in the period, paged. Staff only.';

-- -----------------------------------------------------------------------------
-- 5. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.gestao_cadastros_report_base(date, date, bigint, uuid, public.gestao_cadastros_service_kind) from public, anon;
revoke all on function public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind) from public, anon;
revoke all on function public.gestao_cadastros_report_requests(date, date, bigint, uuid, public.gestao_cadastros_service_kind, boolean, integer, integer) from public, anon;

-- Invoker functions: the caller needs EXECUTE on the private helper as well.
grant execute on function private.gestao_cadastros_report_base(date, date, bigint, uuid, public.gestao_cadastros_service_kind) to authenticated;
grant execute on function public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind) to authenticated;
grant execute on function public.gestao_cadastros_report_requests(date, date, bigint, uuid, public.gestao_cadastros_service_kind, boolean, integer, integer) to authenticated;

commit;
