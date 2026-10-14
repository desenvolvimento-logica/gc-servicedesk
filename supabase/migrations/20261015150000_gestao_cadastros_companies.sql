-- =============================================================================
-- GC Service Desk — client companies synchronized from Acessórias
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates only objects prefixed `gestao_cadastros_` (public schema).
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced.
--
-- Decisions (approved 2026-10-15):
--   * Companies come from the Acessórias API (GET /companies/ListAll, with
--     DtLastDH for incremental runs) into a local copy, because the API does
--     not search by name.
--   * "Código da empresa" in the forms is the Acessórias company ID.
--   * Sync: daily Vercel Cron + a manual button for administrators. Both run
--     on the server with the Supabase secret key (service_role), which is the
--     ONLY role allowed to write these tables. It never reaches the browser.
--   * Inactive companies are kept (history) but not offered in the picker.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261015150000_gestao_cadastros_companies.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.gestao_cadastros_role_events') is null then
    raise exception 'Migration 20261015120000 (user admin) is not applied.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.gestao_cadastros_companies (
  -- Acessórias company ID: the "Código da empresa" used in requests.
  acessorias_id         bigint primary key check (acessorias_id > 0),
  document              text not null,             -- CNPJ/CPF/CAEPF, digits only
  legal_name            text not null,             -- Razão social
  trade_name            text,                      -- Nome fantasia
  active                boolean not null,
  uf                    text,
  tax_regime            text,
  -- Lowercase, accent-free "name trade name document id" for searching
  -- (written by the sync; avoids installing extensions in the shared project).
  search_text           text not null,
  acessorias_updated_at text,                      -- DtLastDH as returned by the API
  synced_at             timestamptz not null default now()
);

comment on table public.gestao_cadastros_companies is
  'GC Service Desk: client companies copied from Acessórias (written only by the server-side sync).';

create index gestao_cadastros_companies_active_name_idx
  on public.gestao_cadastros_companies (active, legal_name);
create index gestao_cadastros_companies_document_idx
  on public.gestao_cadastros_companies (document);

create table public.gestao_cadastros_company_sync_runs (
  id            bigint generated always as identity primary key,
  trigger       text not null check (trigger in ('cron', 'manual')),
  mode          text not null check (mode in ('full', 'incremental')),
  actor_id      bigint references public.users (user_id) on delete restrict,
  actor_name    text,
  status        text not null default 'running' check (status in ('running', 'success', 'error')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  pages         integer not null default 0,
  upserted      integer not null default 0,
  -- Highest DtLastDH seen; the next incremental run starts from it.
  cursor        text,
  error         text check (error is null or char_length(error) <= 2000),
  constraint gestao_cadastros_company_sync_runs_manual_actor_check
    check (trigger = 'cron' or actor_id is not null)
);

comment on table public.gestao_cadastros_company_sync_runs is
  'GC Service Desk: log of Acessórias company synchronizations.';

create index gestao_cadastros_company_sync_runs_started_idx
  on public.gestao_cadastros_company_sync_runs (started_at desc);

-- -----------------------------------------------------------------------------
-- 2. Privileges: authenticated reads (RLS); only service_role writes
-- -----------------------------------------------------------------------------
revoke all on table public.gestao_cadastros_companies from anon, authenticated;
revoke all on table public.gestao_cadastros_company_sync_runs from anon, authenticated;
grant select on table public.gestao_cadastros_companies to authenticated;
grant select on table public.gestao_cadastros_company_sync_runs to authenticated;
grant select, insert, update on table public.gestao_cadastros_companies to service_role;
grant select, insert, update on table public.gestao_cadastros_company_sync_runs to service_role;
grant usage, select on sequence public.gestao_cadastros_company_sync_runs_id_seq to service_role;

alter table public.gestao_cadastros_companies enable row level security;
alter table public.gestao_cadastros_company_sync_runs enable row level security;

-- Anyone with access to the service desk may pick a company.
create policy gestao_cadastros_companies_select
  on public.gestao_cadastros_companies
  for select
  to authenticated
  using ((select private.gestao_cadastros_has_access()));

create policy gestao_cadastros_company_sync_runs_select
  on public.gestao_cadastros_company_sync_runs
  for select
  to authenticated
  using ((select private.gestao_cadastros_has_role('administrator')));

-- service_role bypasses RLS; no write policies for other roles.

commit;
