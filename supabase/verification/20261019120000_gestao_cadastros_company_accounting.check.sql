-- Read-only verification for 20261019120000_gestao_cadastros_company_accounting.sql
-- Run in the Supabase SQL Editor after applying the migration, one block at a
-- time. A failed check raises an error ("... FAILED"). Writing blocks are rolled back.

-- 1. Columns and privileges (unchanged) ---------------------------------------
select jsonb_pretty(jsonb_build_object(
  'columns', (
    select jsonb_object_agg(column_name, data_type) from information_schema.columns
    where table_schema = 'public' and table_name = 'gestao_cadastros_companies'
      and column_name in ('tax_regime', 'acessorias_regime', 'accounting')
  ),
  'rls', (select relrowsecurity from pg_class where oid = 'public.gestao_cadastros_companies'::regclass),
  'authenticated_can_update', has_table_privilege('authenticated', 'public.gestao_cadastros_companies', 'UPDATE')
));
-- Expected: columns tax_regime/acessorias_regime/accounting = text; rls true;
-- authenticated_can_update false.

-- 2. accounting accepts only the approved values -------------------------------
begin;
insert into public.gestao_cadastros_companies (acessorias_id, document, legal_name, active, search_text, accounting)
values (999999998, '00000000000000', 'EMPRESA VERIFICACAO', true, 'empresa verificacao', 'Bancária');
do $$
begin
  begin
    update public.gestao_cadastros_companies set accounting = 'Sim' where acessorias_id = 999999998;
    raise exception 'CHECK FAILED: accounting accepted an unknown value.';
  exception when check_violation then null;
  end;
end;
$$;
select 'OK: accounting check' as result;
rollback;
-- Expected: "OK: accounting check".

-- 3. After the full sync: distribution (read-only) -----------------------------
select tax_regime, accounting, count(*) from public.gestao_cadastros_companies
where active group by 1, 2 order by 3 desc;
