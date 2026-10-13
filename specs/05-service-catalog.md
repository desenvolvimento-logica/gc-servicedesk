# 05 — Service Catalog

## Principle
Services and fields are configuration data, not hard-coded application forms. An administrator must be able to add/edit/deactivate services and configure their fields without source-code changes.

## Service ownership
Each service belongs to a requester department for V1. Initial departments: Fiscal, DP and Contábil.

## Initial Fiscal services
1. Replicador de acumulador — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Nº da OS; Acumulador; Anexo (seção e tabela de imposto 44).
2. Controle de notas faltantes — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência.
3. Criar conjunto de dados — Nome da empresa; Código da empresa; Tributação; Contabilidade; Prestados ou tomados.
4. Senha do usuário SPED — Nome do funcionário; E-mail do funcionário.
5. Importar arquivo BGR — Nome da empresa; Código da empresa; Número do chamado do Onvio.
6. Exportar arquivo BGR — Nome da empresa; Código da empresa; Número do chamado do Onvio.
7. Incluir conta contábil — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Acumulador; Conta débito; Conta crédito.
8. Criar acumulador — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; CFOP; Descrição; Impostos; Lançamento; SPED/EFD-Reinf; Conta débito; Conta crédito.
9. Reativar acumulador — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência.
10. Excluir impostos no acumulador — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência.
11. Incluir imposto no acumulador — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Imposto.
12. Natureza do rendimento — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Imposto.
13. Incluir código de recolhimento — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Imposto.
14. Código de acesso do Simples — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Nº da OS.
15. Sequência de notas — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência.
16. Controle de CFOP por UF de cliente — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência.
17. Permissões de grupo — Módulo; Grupo.
18. Permissão de usuário — Nome do funcionário; Acesso solicitado.
19. Senha gerente — Nome da empresa; Código da empresa; Número do chamado.

## Initial DP services
1. Importar arquivo BGR — Nome da empresa; Código da empresa; Número do chamado do Onvio.
2. Exportar arquivo BGR — Nome da empresa; Código da empresa; Número do chamado do Onvio.
3. Importar arquivo Word — Nome da empresa; Código da empresa; Número do chamado do Onvio.
4. Cadastro do Onvio — Nome da empresa; Código da empresa; Nome e sobrenome do cliente; E-mail do cliente.
5. Senha gerente — Nome da empresa; Código da empresa; Número do chamado.

## Initial Contábil services
1. Incluir conta contábil — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Acumulador; Conta débito; Conta crédito.
2. Excluir conta contábil — Nome da empresa; Código da empresa; Tributação; Contabilidade; Vigência; Acumulador; Conta débito; Conta crédito.
3. Permissões de grupo — Módulo; Grupo.
4. Liberação/cadastro de empresa — Nome da empresa; Código da empresa; Número do chamado.
5. Permissão de usuário — Nome do funcionário; Acesso solicitado.

## Common field
Every service exposes `Observações` as a free-text field in addition to service-specific fields. It is available but not mandatory unless later configured.

## Correction/rework service
Each requester department must have `Correção de Cadastro / Refazer` with at least: Nome da empresa, Código da empresa, Serviço original que precisa de correção, referência à solicitação/OS anterior se houver, Motivo da correção and Observações.

## Open configuration questions
Before seed creation confirm field types, which fields are selects, allowed values for Tributação, Contabilidade, Impostos and Prestados/Tomados, and attachment constraints.
