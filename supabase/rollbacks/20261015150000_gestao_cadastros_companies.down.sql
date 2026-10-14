-- Rollback for 20261015150000_gestao_cadastros_companies.sql
-- Removes ONLY the objects created by that migration. The companies are a
-- copy of Acessórias data and can be synchronized again; requests keep their
-- own company name/code snapshots.

begin;

drop table if exists public.gestao_cadastros_company_sync_runs;
drop table if exists public.gestao_cadastros_companies;

commit;
