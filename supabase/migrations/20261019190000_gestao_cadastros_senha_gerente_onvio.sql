-- =============================================================================
-- GC Service Desk — "Número do chamado do Onvio" in the "Senha gerente" services
--
-- Scope rules (docs/environment-decisions.md):
--   * Changes only catalog data in public.gestao_cadastros_service_fields.
--   * Shared tables auth.users, public.users and public.dpto are only READ.
--
-- Decisions (approved 2026-10-19):
--   * "Senha gerente" (Fiscal and Departamento Pessoal) gets the requester
--     field numero_chamado_onvio ("Número do chamado do Onvio"), text,
--     required — same key/label/rule as Importar/Exportar arquivo BGR.
--   * Placed right after "Código da empresa" (before "Observações").
--   * Existing requests are unchanged (their values are snapshotted).
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261019190000_gestao_cadastros_senha_gerente_onvio.down.sql
-- =============================================================================

begin;

do $$
begin
  if (
    select count(*) from public.gestao_cadastros_services s
    join public.dpto d on d.dpto_id = s.dpto_id
    where s.name = 'Senha gerente' and d.dpto_name in ('Fiscal', 'Departamento Pessoal')
  ) <> 2 then
    raise exception 'Expected the "Senha gerente" services of Fiscal and Departamento Pessoal.';
  end if;

  if exists (
    select 1 from public.gestao_cadastros_service_fields f
    join public.gestao_cadastros_services s on s.id = f.service_id
    where s.name = 'Senha gerente' and f.field_key = 'numero_chamado_onvio'
  ) then
    raise exception '"Senha gerente" already has numero_chamado_onvio. Review before applying.';
  end if;
end;
$$;

-- Sort order: 5 after "Código da empresa" (the seed spaces fields by 10).
insert into public.gestao_cadastros_service_fields
  (service_id, field_key, label, field_type, required, active, sort_order)
select s.id, 'numero_chamado_onvio', 'Número do chamado do Onvio', 'text', true, true,
       coalesce((
         select f.sort_order from public.gestao_cadastros_service_fields f
         where f.service_id = s.id and f.field_key = 'codigo_empresa'
       ), 0) + 5
from public.gestao_cadastros_services s
join public.dpto d on d.dpto_id = s.dpto_id
where s.name = 'Senha gerente' and d.dpto_name in ('Fiscal', 'Departamento Pessoal');

do $$
begin
  if (
    select count(*) from public.gestao_cadastros_service_fields f
    join public.gestao_cadastros_services s on s.id = f.service_id
    where s.name = 'Senha gerente' and f.field_key = 'numero_chamado_onvio'
  ) <> 2 then
    raise exception 'Expected 2 new fields.';
  end if;
end;
$$;

commit;
