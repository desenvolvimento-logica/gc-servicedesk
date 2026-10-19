-- Read-only verification for 20261019190000_gestao_cadastros_senha_gerente_onvio.sql
-- Run in the Supabase SQL Editor after applying the migration.

-- Active fields of "Senha gerente", in form order.
select d.dpto_name, f.sort_order, f.field_key, f.label, f.field_type, f.required
from public.gestao_cadastros_service_fields f
join public.gestao_cadastros_services s on s.id = f.service_id
join public.dpto d on d.dpto_id = s.dpto_id
where s.name = 'Senha gerente' and f.active
order by d.dpto_name, f.sort_order;
-- Expected for each department (Departamento Pessoal, Fiscal):
-- nome_empresa, codigo_empresa, numero_chamado_onvio (text, required = true),
-- observacoes.
