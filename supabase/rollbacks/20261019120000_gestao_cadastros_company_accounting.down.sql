-- Rollback for 20261019120000_gestao_cadastros_company_accounting.sql
-- Removes ONLY the columns added by that migration (data is a copy of
-- Acessórias and can be synchronized again). tax_regime is kept.

begin;

alter table public.gestao_cadastros_companies
  drop column if exists accounting,
  drop column if exists acessorias_regime;

comment on column public.gestao_cadastros_companies.tax_regime is null;

commit;
