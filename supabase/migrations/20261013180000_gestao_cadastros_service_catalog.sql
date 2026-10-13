-- =============================================================================
-- GC Service Desk — Phase 3: service catalog (services and service fields)
--
-- Scope rules (docs/environment-decisions.md):
--   * Creates only objects prefixed `gestao_cadastros_` (public schema) and
--     helper functions `private.gestao_cadastros_*`.
--   * Shared tables auth.users, public.users and public.dpto are only READ /
--     referenced. No column, trigger, policy or function is added to or
--     changed on them, and no existing function is replaced.
--
-- Historical integrity: field_key/field_type of a field and dpto_id/kind of a
-- service are immutable; nothing is ever deleted (no DELETE grant). Requests
-- (Phase 4) snapshot label/type/options at submission time.
--
-- Apply: review, then run the whole file once in the Supabase SQL Editor.
-- It runs in a single transaction; any failed check aborts everything.
-- Rollback: supabase/rollbacks/20261013180000_gestao_cadastros_service_catalog.down.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight checks
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.gestao_cadastros_requester_departments') is null then
    raise exception 'Phase 2 migration (20261013160000) is not applied.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.gestao_cadastros_service_kind as enum ('standard', 'correction');

comment on type public.gestao_cadastros_service_kind is
  'standard = regular service; correction = "Correção de Cadastro / Refazer" (one active per department).';

create type public.gestao_cadastros_field_type as enum (
  'text', 'textarea', 'number', 'date', 'email', 'select', 'multiselect', 'boolean', 'file'
);

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
create table public.gestao_cadastros_services (
  id          uuid primary key default gen_random_uuid(),
  -- RESTRICT: a requester department with services is deactivated, never
  -- deleted (this also blocks deleting the corporate public.dpto row, on purpose).
  dpto_id     bigint not null
              references public.gestao_cadastros_requester_departments (dpto_id) on delete restrict,
  name        text not null
              check (name = btrim(name) and char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  kind        public.gestao_cadastros_service_kind not null default 'standard',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  -- Stamped by trigger from the session; never taken from the client.
  created_by  bigint references public.users (user_id) on delete set null,
  updated_by  bigint references public.users (user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.gestao_cadastros_services is
  'GC Service Desk catalog: services each requester department may request.';

create unique index gestao_cadastros_services_dpto_name_key
  on public.gestao_cadastros_services (dpto_id, lower(name));

create unique index gestao_cadastros_services_one_active_correction_key
  on public.gestao_cadastros_services (dpto_id)
  where kind = 'correction' and active;

create table public.gestao_cadastros_service_fields (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.gestao_cadastros_services (id) on delete restrict,
  field_key   text not null check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label       text not null
              check (label = btrim(label) and char_length(label) between 1 and 120),
  field_type  public.gestao_cadastros_field_type not null,
  required    boolean not null default false,
  -- [{ "value": "...", "label": "...", "active": true }] — select/multiselect only.
  options     jsonb not null default '[]'::jsonb,
  placeholder text check (placeholder is null or char_length(placeholder) <= 200),
  help_text   text check (help_text is null or char_length(help_text) <= 500),
  -- e.g. { "minLength": 1, "maxLength": 200, "min": 0, "max": 10 }
  validation  jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_by  bigint references public.users (user_id) on delete set null,
  updated_by  bigint references public.users (user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint gestao_cadastros_service_fields_service_key_key unique (service_id, field_key),
  constraint gestao_cadastros_service_fields_options_check check (
    jsonb_typeof(options) = 'array'
    and (field_type in ('select', 'multiselect') or options = '[]'::jsonb)
  ),
  constraint gestao_cadastros_service_fields_validation_check check (jsonb_typeof(validation) = 'object')
);

comment on table public.gestao_cadastros_service_fields is
  'GC Service Desk catalog: dynamic form fields of each service. field_key/field_type are immutable.';

create index gestao_cadastros_service_fields_service_order_idx
  on public.gestao_cadastros_service_fields (service_id, sort_order);

-- -----------------------------------------------------------------------------
-- 3. Triggers: actor/timestamp stamping and immutability guards
-- -----------------------------------------------------------------------------
create function private.gestao_cadastros_stamp_catalog_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := private.gestao_cadastros_current_user_id();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := private.gestao_cadastros_current_user_id();
  new.updated_at := now();
  return new;
end;
$$;

create function private.gestao_cadastros_guard_service_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dpto_id <> old.dpto_id or new.kind <> old.kind then
    raise exception 'Department and kind of a service cannot be changed; create a new service instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function private.gestao_cadastros_guard_service_field_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_id <> old.service_id
     or new.field_key <> old.field_key
     or new.field_type <> old.field_type then
    raise exception 'Service, key and type of a field cannot be changed; deactivate it and create a new field instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger gestao_cadastros_services_stamp
  before insert or update on public.gestao_cadastros_services
  for each row execute function private.gestao_cadastros_stamp_catalog_row();

create trigger gestao_cadastros_services_guard
  before update on public.gestao_cadastros_services
  for each row execute function private.gestao_cadastros_guard_service_update();

create trigger gestao_cadastros_service_fields_stamp
  before insert or update on public.gestao_cadastros_service_fields
  for each row execute function private.gestao_cadastros_stamp_catalog_row();

create trigger gestao_cadastros_service_fields_guard
  before update on public.gestao_cadastros_service_fields
  for each row execute function private.gestao_cadastros_guard_service_field_update();

-- -----------------------------------------------------------------------------
-- 4. Admin RPC: corporate departments with their requester status.
--    Needed because public.dpto RLS restricts names to corporate admins.
-- -----------------------------------------------------------------------------
create function public.gestao_cadastros_admin_departments()
returns table (
  id                      bigint,
  name                    text,
  is_requester_department boolean,
  active                  boolean,
  sort_order              integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.gestao_cadastros_has_role('administrator') then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select d.dpto_id,
           d.dpto_name::text,
           rd.dpto_id is not null,
           coalesce(rd.active, false),
           coalesce(rd.sort_order, 0)
    from public.dpto d
    left join public.gestao_cadastros_requester_departments rd on rd.dpto_id = d.dpto_id
    order by d.dpto_name;
end;
$$;

comment on function public.gestao_cadastros_admin_departments() is
  'GC Service Desk: corporate departments and their requester status. GC administrators only.';

-- -----------------------------------------------------------------------------
-- 5. Privileges
-- -----------------------------------------------------------------------------
revoke all on function private.gestao_cadastros_stamp_catalog_row() from public, anon, authenticated;
revoke all on function private.gestao_cadastros_guard_service_update() from public, anon, authenticated;
revoke all on function private.gestao_cadastros_guard_service_field_update() from public, anon, authenticated;
revoke all on function public.gestao_cadastros_admin_departments() from public, anon;
grant execute on function public.gestao_cadastros_admin_departments() to authenticated;

-- No DELETE anywhere: catalog rows are deactivated, never deleted.
revoke all on table public.gestao_cadastros_services from anon, authenticated;
revoke all on table public.gestao_cadastros_service_fields from anon, authenticated;
grant select, insert, update on table public.gestao_cadastros_services to authenticated;
grant select, insert, update on table public.gestao_cadastros_service_fields to authenticated;

-- Requester departments become administrable (Phase 2 left them read-only).
grant insert (dpto_id, active, sort_order) on table public.gestao_cadastros_requester_departments to authenticated;
grant update (active, sort_order) on table public.gestao_cadastros_requester_departments to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.gestao_cadastros_services enable row level security;
alter table public.gestao_cadastros_service_fields enable row level security;

-- Staff sees the whole catalog; a requester sees only active services of the
-- department(s) they may open requests for.
create policy gestao_cadastros_services_select
  on public.gestao_cadastros_services
  for select
  to authenticated
  using (
    (select private.gestao_cadastros_is_staff())
    or (active and private.gestao_cadastros_can_open_requests(dpto_id))
  );

create policy gestao_cadastros_services_insert
  on public.gestao_cadastros_services
  for insert
  to authenticated
  with check ((select private.gestao_cadastros_has_role('administrator')));

create policy gestao_cadastros_services_update
  on public.gestao_cadastros_services
  for update
  to authenticated
  using ((select private.gestao_cadastros_has_role('administrator')))
  with check ((select private.gestao_cadastros_has_role('administrator')));

-- The subquery on services is itself filtered by the services policy.
create policy gestao_cadastros_service_fields_select
  on public.gestao_cadastros_service_fields
  for select
  to authenticated
  using (
    (select private.gestao_cadastros_is_staff())
    or (
      active
      and exists (
        select 1 from public.gestao_cadastros_services s
        where s.id = service_id
      )
    )
  );

create policy gestao_cadastros_service_fields_insert
  on public.gestao_cadastros_service_fields
  for insert
  to authenticated
  with check ((select private.gestao_cadastros_has_role('administrator')));

create policy gestao_cadastros_service_fields_update
  on public.gestao_cadastros_service_fields
  for update
  to authenticated
  using ((select private.gestao_cadastros_has_role('administrator')))
  with check ((select private.gestao_cadastros_has_role('administrator')));

create policy gestao_cadastros_requester_departments_insert
  on public.gestao_cadastros_requester_departments
  for insert
  to authenticated
  with check ((select private.gestao_cadastros_has_role('administrator')));

create policy gestao_cadastros_requester_departments_update
  on public.gestao_cadastros_requester_departments
  for update
  to authenticated
  using ((select private.gestao_cadastros_has_role('administrator')))
  with check ((select private.gestao_cadastros_has_role('administrator')));

-- -----------------------------------------------------------------------------
-- 7. Initial catalog (specs/05-service-catalog.md)
--    Free-text fields for V1 (filled in by the requester); every service ends
--    with the optional "Observações". Aborts if any count does not match.
-- -----------------------------------------------------------------------------
-- Single statement (no temporary tables) so it does not depend on the SQL
-- Editor keeping one session/transaction across statements.
with seed_fields (field_key, label, field_type, required, active, help_text) as (
  values
    ('nome_empresa',         'Nome da empresa',                          'text',     true,  true,  null),
    ('codigo_empresa',       'Código da empresa',                        'text',     true,  true,  null),
    ('tributacao',           'Tributação',                               'text',     true,  true,  null),
    ('contabilidade',        'Contabilidade',                            'text',     true,  true,  null),
    ('vigencia',             'Vigência',                                 'text',     true,  true,  null),
    ('numero_os',            'Nº da OS',                                 'text',     true,  true,  null),
    ('acumulador',           'Acumulador',                               'text',     true,  true,  null),
    -- Inactive until attachment rules are approved (Phase 4).
    ('anexo',                'Anexo',                                    'file',     false, false, 'Seção e tabela de imposto 44.'),
    ('prestados_tomados',    'Prestados ou tomados',                     'text',     true,  true,  null),
    ('nome_funcionario',     'Nome do funcionário',                      'text',     true,  true,  null),
    ('email_funcionario',    'E-mail do funcionário',                    'email',    true,  true,  null),
    ('numero_chamado_onvio', 'Número do chamado do Onvio',               'text',     true,  true,  null),
    ('conta_debito',         'Conta débito',                             'text',     true,  true,  null),
    ('conta_credito',        'Conta crédito',                            'text',     true,  true,  null),
    ('cfop',                 'CFOP',                                     'text',     true,  true,  null),
    ('descricao',            'Descrição',                                'textarea', true,  true,  null),
    ('impostos',             'Impostos',                                 'text',     true,  true,  null),
    ('lancamento',           'Lançamento',                               'text',     true,  true,  null),
    ('sped_reinf',           'SPED/EFD-Reinf',                           'text',     true,  true,  null),
    ('imposto',              'Imposto',                                  'text',     true,  true,  null),
    ('modulo',               'Módulo',                                   'text',     true,  true,  null),
    ('grupo',                'Grupo',                                    'text',     true,  true,  null),
    ('acesso_solicitado',    'Acesso solicitado',                        'textarea', true,  true,  null),
    ('numero_chamado',       'Número do chamado',                        'text',     true,  true,  null),
    ('nome_cliente',         'Nome e sobrenome do cliente',              'text',     true,  true,  null),
    ('email_cliente',        'E-mail do cliente',                        'email',    true,  true,  null),
    ('servico_original',     'Serviço original que precisa de correção', 'text',     true,  true,  null),
    ('solicitacao_anterior', 'Solicitação/OS anterior',                  'text',     false, true,  'Número da solicitação ou OS original, se houver.'),
    ('motivo_correcao',      'Motivo da correção',                       'textarea', true,  true,  null),
    ('observacoes',          'Observações',                              'textarea', false, true,  null)
),
seed_services (dpto_name, sort_order, name, kind, field_keys) as (
  values
    -- Fiscal
    ('Fiscal',  10, 'Replicador de acumulador',          'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','numero_os','acumulador','anexo']),
    ('Fiscal',  20, 'Controle de notas faltantes',       'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia']),
    ('Fiscal',  30, 'Criar conjunto de dados',           'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','prestados_tomados']),
    ('Fiscal',  40, 'Senha do usuário SPED',             'standard', array['nome_funcionario','email_funcionario']),
    ('Fiscal',  50, 'Importar arquivo BGR',              'standard', array['nome_empresa','codigo_empresa','numero_chamado_onvio']),
    ('Fiscal',  60, 'Exportar arquivo BGR',              'standard', array['nome_empresa','codigo_empresa','numero_chamado_onvio']),
    ('Fiscal',  70, 'Incluir conta contábil',            'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','acumulador','conta_debito','conta_credito']),
    ('Fiscal',  80, 'Criar acumulador',                  'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','cfop','descricao','impostos','lancamento','sped_reinf','conta_debito','conta_credito']),
    ('Fiscal',  90, 'Reativar acumulador',               'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia']),
    ('Fiscal', 100, 'Excluir impostos no acumulador',    'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia']),
    ('Fiscal', 110, 'Incluir imposto no acumulador',     'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','imposto']),
    ('Fiscal', 120, 'Natureza do rendimento',            'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','imposto']),
    ('Fiscal', 130, 'Incluir código de recolhimento',    'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','imposto']),
    ('Fiscal', 140, 'Código de acesso do Simples',       'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','numero_os']),
    ('Fiscal', 150, 'Sequência de notas',                'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia']),
    ('Fiscal', 160, 'Controle de CFOP por UF de cliente','standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia']),
    ('Fiscal', 170, 'Permissões de grupo',               'standard', array['modulo','grupo']),
    ('Fiscal', 180, 'Permissão de usuário',              'standard', array['nome_funcionario','acesso_solicitado']),
    ('Fiscal', 190, 'Senha gerente',                     'standard', array['nome_empresa','codigo_empresa','numero_chamado']),
    -- Departamento Pessoal
    ('Departamento Pessoal', 10, 'Importar arquivo BGR',  'standard', array['nome_empresa','codigo_empresa','numero_chamado_onvio']),
    ('Departamento Pessoal', 20, 'Exportar arquivo BGR',  'standard', array['nome_empresa','codigo_empresa','numero_chamado_onvio']),
    ('Departamento Pessoal', 30, 'Importar arquivo Word', 'standard', array['nome_empresa','codigo_empresa','numero_chamado_onvio']),
    ('Departamento Pessoal', 40, 'Cadastro do Onvio',     'standard', array['nome_empresa','codigo_empresa','nome_cliente','email_cliente']),
    ('Departamento Pessoal', 50, 'Senha gerente',         'standard', array['nome_empresa','codigo_empresa','numero_chamado']),
    -- Contábil
    ('Contábil', 10, 'Incluir conta contábil',        'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','acumulador','conta_debito','conta_credito']),
    ('Contábil', 20, 'Excluir conta contábil',        'standard', array['nome_empresa','codigo_empresa','tributacao','contabilidade','vigencia','acumulador','conta_debito','conta_credito']),
    ('Contábil', 30, 'Permissões de grupo',           'standard', array['modulo','grupo']),
    ('Contábil', 40, 'Liberação/cadastro de empresa', 'standard', array['nome_empresa','codigo_empresa','numero_chamado']),
    ('Contábil', 50, 'Permissão de usuário',          'standard', array['nome_funcionario','acesso_solicitado']),
    -- Correction/rework service, one per requester department
    ('Fiscal',               900, 'Correção de Cadastro / Refazer', 'correction', array['nome_empresa','codigo_empresa','servico_original','solicitacao_anterior','motivo_correcao']),
    ('Departamento Pessoal', 900, 'Correção de Cadastro / Refazer', 'correction', array['nome_empresa','codigo_empresa','servico_original','solicitacao_anterior','motivo_correcao']),
    ('Contábil',             900, 'Correção de Cadastro / Refazer', 'correction', array['nome_empresa','codigo_empresa','servico_original','solicitacao_anterior','motivo_correcao'])
),
inserted_services as (
  insert into public.gestao_cadastros_services (dpto_id, name, kind, sort_order)
  select rd.dpto_id, s.name, s.kind::public.gestao_cadastros_service_kind, s.sort_order
  from seed_services s
  join public.dpto d on d.dpto_name = s.dpto_name
  join public.gestao_cadastros_requester_departments rd on rd.dpto_id = d.dpto_id
  returning id, dpto_id, name
)
insert into public.gestao_cadastros_service_fields
  (service_id, field_key, label, field_type, required, active, help_text, sort_order)
select sv.id, f.field_key, f.label, f.field_type::public.gestao_cadastros_field_type,
       f.required, f.active, f.help_text, (k.ord * 10)::integer
from seed_services s
join public.dpto d on d.dpto_name = s.dpto_name
join inserted_services sv on sv.dpto_id = d.dpto_id and sv.name = s.name
cross join lateral unnest(s.field_keys || array['observacoes']) with ordinality as k (field_key, ord)
join seed_fields f on f.field_key = k.field_key;

-- Expected totals: 32 services (Fiscal 20, Departamento Pessoal 6, Contábil 6)
-- and 183 fields (every listed field + "Observações" on each service).
-- A field key missing from seed_fields would silently drop a row: the field
-- total below catches it.
do $$
declare
  services_total integer;
  fields_total   integer;
begin
  select count(*) into services_total from public.gestao_cadastros_services;
  select count(*) into fields_total from public.gestao_cadastros_service_fields;
  if services_total <> 32 or fields_total <> 183 then
    raise exception 'Seed mismatch: expected 32 services / 183 fields, got % / %.', services_total, fields_total;
  end if;
end;
$$;

commit;
