-- Rollback for 20261019190000_gestao_cadastros_senha_gerente_onvio.sql
-- Removes the field when no request used it; otherwise deactivates it
-- (submitted values reference the field and are permanent).

begin;

update public.gestao_cadastros_service_fields f
set active = false
from public.gestao_cadastros_services s
where s.id = f.service_id and s.name = 'Senha gerente' and f.field_key = 'numero_chamado_onvio'
  and exists (select 1 from public.gestao_cadastros_request_values v where v.service_field_id = f.id);

delete from public.gestao_cadastros_service_fields f
using public.gestao_cadastros_services s
where s.id = f.service_id and s.name = 'Senha gerente' and f.field_key = 'numero_chamado_onvio'
  and not exists (select 1 from public.gestao_cadastros_request_values v where v.service_field_id = f.id);

commit;
