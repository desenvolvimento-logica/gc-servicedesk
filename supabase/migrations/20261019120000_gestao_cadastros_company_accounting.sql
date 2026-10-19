-- =============================================================================
-- GC Service Desk — tax regime and accounting type of client companies
--
-- Scope rules (docs/environment-decisions.md):
--   * Changes only public.gestao_cadastros_companies. No privilege or RLS
--     change: the table stays readable by users with access and writable only
--     by service_role (server-side sync).
--
-- Decisions (approved 2026-10-19):
--   * The sync asks Acessórias for `registrationData`, which brings the
--     company's "Regime", e.g. "LUCRO REAL C INSCRIÇÃO - COM FUNCIONÁRIOS -
--     C BANCÁRIA". The API has no separate accounting field: the office
--     encodes it in the Regime suffix.
--   * acessorias_regime keeps the Regime as returned (audit / re-parsing).
--   * tax_regime (existing) receives only the regime ("Lucro Real"...), or the
--     whole Regime when it does not follow the pattern.
--   * accounting: 'Bancária' (C BANCÁRIA), 'Fiscal' (CONT FISCAL / C FISCAL),
--     'Não' (no suffix) or null when Acessórias has no Regime.
--   * Existing rows are filled by a full sync ("Sincronização completa").
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- Rollback: supabase/rollbacks/20261019120000_gestao_cadastros_company_accounting.down.sql
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.gestao_cadastros_companies') is null then
    raise exception 'Migration 20261015150000 (companies) is not applied.';
  end if;
end;
$$;

alter table public.gestao_cadastros_companies
  add column acessorias_regime text,                 -- Regime as returned by Acessórias
  add column accounting        text
    constraint gestao_cadastros_companies_accounting_check
    check (accounting is null or accounting in ('Bancária', 'Fiscal', 'Não'));

comment on column public.gestao_cadastros_companies.tax_regime is
  'Tributação derived from the Acessórias Regime (e.g. Lucro Real).';
comment on column public.gestao_cadastros_companies.acessorias_regime is
  'Regime exactly as returned by Acessórias (registrationData).';
comment on column public.gestao_cadastros_companies.accounting is
  'Accounting type derived from the Regime suffix: Bancária, Fiscal or Não.';

commit;
