-- Rollback for 20261015090000_gestao_cadastros_reports.sql
-- Removes ONLY the objects created by that migration and restores the Phase 4
-- service index. Read-only functions: no data is affected.

begin;

drop function if exists public.gestao_cadastros_report_requests(date, date, bigint, uuid, public.gestao_cadastros_service_kind, boolean, integer, integer);
drop function if exists public.gestao_cadastros_report_summary(date, date, bigint, uuid, public.gestao_cadastros_service_kind);
drop function if exists private.gestao_cadastros_report_base(date, date, bigint, uuid, public.gestao_cadastros_service_kind);

create index if not exists gestao_cadastros_requests_service_idx
  on public.gestao_cadastros_requests (service_id);
drop index if exists public.gestao_cadastros_requests_service_opened_idx;
drop index if exists public.gestao_cadastros_requests_opened_idx;

commit;
