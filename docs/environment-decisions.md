# Environment Decisions (Phase 0)

Status: Phase 0 complete.
Last updated: 2026-10-14 (Phase 4).

No secrets, keys or connection strings belong in this file.

## Supabase

| Item | Decision |
|---|---|
| Project | Existing unified office project — never create a new one |
| URL | `https://olyvjnqmrzkziirzbmhi.supabase.co` |
| Project ref | `olyvjnqmrzkziirzbmhi` |
| Topology | Single project — it **is production**. No separate dev/staging |
| Supabase CLI | Not linked yet |
| Namespace | `public` schema, every table prefixed `gestao_cadastros_` |
| Prefix collision | None — no existing object uses `gestao_cadastros_` |

Consequences of the single-project topology:
- Every migration hits production and requires explicit approval before being applied.
- RLS is enabled on every `gestao_cadastros_` table at creation time (the `public` schema is exposed through the Data API).
- `SECURITY DEFINER` helpers go in the existing `private` schema (not exposed through the Data API), following the pattern already used by other apps (`private.has_role`, `private.cc_has_role`).

## Existing shared identity model (reuse)

Discovered through read-only introspection. The office already has a corporate identity layer used by the portal and other apps:

```
auth.users (Supabase Auth, provider "azure" = Microsoft Entra ID)
   ▲ auth_user_id (FK, nullable)
public.users (user_id bigint PK, user_email, user_dpto, user_role, is_admin)
   │ user_dpto (FK)
   ▼
public.dpto (dpto_id bigint PK, dpto_name)
```

- `auth.users` trigger `on_auth_user_created → link_auth_user_to_app_user` links a new Supabase Auth user to the existing `public.users` row on first login. `public.users` has the reverse trigger `link_app_user_to_auth_user`.
- Existing helpers (`SECURITY DEFINER`, keyed by `auth.uid()`): `public.current_user_dpto()`, `public.current_user_is_admin()`, `public.current_user_role()`.
- `public.users.user_role` is the office hierarchy (`usuario`, `lider`, `coordenador`, `gerente`, `diretor`), and `is_admin` is the corporate/portal admin flag. Neither is the GC Service Desk role.
- `public.departamentos` is empty and has no policies — treated as legacy, not used.
- Other apps keep their own prefixed tables (`hbh_`, `lic_`, `pc_`, `cc_`, `tp_`). `lic_profiles.corporate_user_id → public.users.user_id` is the precedent for linking an app to the corporate user.
- Note: trigger `on_auth_user_created_cc → cc_handle_new_user` also fires for every new auth user (another app's side effect; not ours to change).

### Proposed reuse
- **Identity**: `auth.uid()` → `public.users.auth_user_id`. GC tables reference `public.users(user_id)`.
- **Requester department**: `public.users.user_dpto` → `public.dpto`. Never taken from the client.
- **GC roles**: new table `gestao_cadastros_user_roles` (operator, administrator), independent of `user_role`/`is_admin`.
- **Requester departments in the catalog**: reference `public.dpto` rows rather than duplicating names. Initial ones already exist:

| Spec department | `dpto_id` | `dpto_name` |
|---|---|---|
| Fiscal | 7 | Fiscal |
| DP | 3 | Departamento Pessoal |
| Contábil | 2 | Contábil |

## Authentication

- Microsoft Entra ID is **already configured** as the Supabase Auth `azure` provider (66 Azure identities vs 8 email identities in the project).
- Phase 2 likely needs only the app's redirect URLs added to the Supabase Auth allow-list — no new App Registration. To be confirmed in Phase 2.

## Initial users

| Email | GC role | Corporate dpto | Linked to auth |
|---|---|---|---|
| desenvolvimento@escritoriologica.com.br | administrator | Desenvolvimento | yes (azure) |
| anabovi.gestaodecadastros@escritoriologica.com.br | operator | Gestão de Cadastros | not yet — links on first SSO login |
| tributario@escritoriologica.com.br | operator | Tributário | yes (azure) |

All three exist in `public.users`.

## Local toolchain

- Node.js v24.18.0 (LTS)
- pnpm 12.11.2 (via Corepack)

## Resolved decisions

1. **Requester eligibility** — only users whose `public.users.user_dpto` is one of the configured requester departments (initially Fiscal, Contábil, Departamento Pessoal). Users of other departments cannot open requests; operators/administrators are granted by GC role, not by department.
2. **Offboarding** — access is revoked by disabling the account in Microsoft Entra ID. `public.users` has no `active` flag; `gestao_cadastros_user_roles` keeps its own `active` flag for GC roles.
3. **Administrator** — desenvolvimento@escritoriologica.com.br (currently the only corporate admin) is the GC administrator. Implemented as an explicit seeded `administrator` role, **not** by inheriting `public.users.is_admin`, so a future corporate admin does not silently gain GC admin access.
4. **Dev/test database** — no Docker available; development runs against the production project under these constraints:
   - migrations only create/alter objects prefixed `gestao_cadastros_` (tables, types, policies, indexes) and functions under `private.gestao_cadastros_*`;
   - shared identity tables (`auth.users`, `public.users`, `public.dpto`) are **read-only** for this app — no columns, triggers, policies or functions added to or changed on them; existing functions are never replaced;
   - every migration is shown and approved before being applied;
   - automated tests that write data must be scoped and cleaned up (strategy defined with the test setup).
5. **Hosting** — Vercel. Redirect URLs (production, previews, localhost) go into the Supabase Auth allow-list in Phase 2.
6. **Service field types and option lists** — taken from `specs/` and resolved per phase as implementation advances.

## Access model (Phase 2)

| Profile | Defined by | Opens requests | Sees requests |
|---|---|---|---|
| Requester | `user_dpto` in an active `gestao_cadastros_requester_departments` row, no GC role | Own department only | Own only |
| Operator | `operator` in `gestao_cadastros_user_roles` | Any active requester department | All |
| Administrator | `administrator` in `gestao_cadastros_user_roles` | Any active requester department | All + configuration |
| No access | Login not linked to `public.users`, or neither of the above | — | — |

- Profile resolution: `public.gestao_cadastros_my_profile()` (`SECURITY DEFINER`, returns only the caller's own profile; needed because `public.dpto` RLS restricts names to corporate admins). Policy helpers live in `private.gestao_cadastros_*`.
- Provisioning: pre-provisioned corporate users only (`public.users`); nobody gets access from the e-mail domain alone.
- Azure tenant restriction is configured in the Supabase Azure provider.
- Sign-out uses `scope: "local"`: a global sign-out would also end the user's sessions in the other office apps sharing the Supabase project.
- Supabase Auth redirect allow-list: `http://localhost:3000/auth/callback`, `https://gc-servicedesk.vercel.app/auth/callback`. The shared **Site URL is never changed**. Vercel preview URLs are not allow-listed.

## Migrations

- Versioned in `supabase/migrations/`, with a matching rollback in `supabase/rollbacks/` and read-only checks in `supabase/verification/`.
- Applied manually in the Supabase SQL Editor after review — not with `supabase db push`, which would try to reconcile the shared project's migration history.

| Migration | Applied |
|---|---|
| `20261013160000_gestao_cadastros_roles_and_requester_departments` | 2026-10-13, verified |
| `20261013180000_gestao_cadastros_service_catalog` | 2026-10-13, verified |
| `20261014120000_gestao_cadastros_requests` | 2026-10-14, verified |

Note: the Supabase SQL Editor may not keep one session across statements, so migrations must not rely on temporary tables (`on commit drop`); seed data goes in a single statement with CTEs.

## Service catalog (Phase 3)

- Tables `gestao_cadastros_services` (per requester department; `kind` = `standard` | `correction`) and `gestao_cadastros_service_fields`.
- Initial catalog from `specs/05-service-catalog.md`: 32 services (Fiscal 20, DP 6, Contábil 6, including one "Correção de Cadastro / Refazer" each) and 183 fields. For V1 every field is free text filled in by the requester (e-mail fields use `email`); no option lists yet. Every service ends with the optional "Observações".
- "Anexo" (Replicador de acumulador) is seeded **inactive** with type `file`; the admin UI does not offer or activate `file` fields until attachment rules are approved.
- Historical integrity: `field_key`/`field_type` of a field and `dpto_id`/`kind` of a service are immutable (triggers); no DELETE grant — deactivate instead; saved select options are never removed (only deactivated). Requests (Phase 4) will snapshot label/type/option labels at submission.
- `created_by`/`updated_by` are stamped by trigger from the session.
- RLS: administrators read/write; operators read all; requesters read only active services/fields of departments they may open requests for. `gestao_cadastros_requester_departments` gained admin-only INSERT/UPDATE.
- `public.gestao_cadastros_admin_departments()` lists corporate departments for GC administrators only.

## Requests (Phase 4)

Decisions approved 2026-10-14:
- **Request number** `GC-YYYY-NNNNNN`; the sequence restarts every calendar year (São Paulo time), kept in `gestao_cadastros_request_counters`.
- **Status** is an enum `gestao_cadastros_request_status`: `open` (Aberta), `in_progress` (Em andamento), `closed` (Concluída). `completed_at` is set if and only if the status is `closed`; a closed request cannot be updated (trigger).
- **Requester** is always the signed-in user, including operators/administrators (no "open on behalf of"). The request department is the selected service's department; the requester's own corporate department is snapshotted separately.
- **Foreign keys to `public.users`** (requester, assignee, event actor) are `ON DELETE RESTRICT`: a corporate user with GC history cannot be deleted; offboarding is done by disabling the account in Entra ID.
- **Attachments** deferred: `file` fields stay inactive and are rejected on submission.

Model:
- `gestao_cadastros_requests` keeps snapshots of service name/kind, department name and requester name/e-mail/department; the snapshot columns are immutable (trigger). `company_name`/`company_code` are copied from the submitted `nome_empresa`/`codigo_empresa` values (field-key convention) for search and reporting.
- `gestao_cadastros_request_values`: one row per field active at submission (empty optional fields included), with the field's key/label/type/order snapshot, typed value columns and option labels — later catalog edits never change what was submitted. Append-only.
- `gestao_cadastros_request_events`: append-only history with `visibility` (`requester` | `internal`); internal notes must be `internal`. Phase 4 writes `request_created`.
- Nothing is deleted or rewritten: triggers reject DELETE on requests and UPDATE/DELETE on values/events, for every role.
- Writes only through `public.gestao_cadastros_create_request(service_id, values)` (`SECURITY DEFINER`): derives the requester from the session, checks the department permission, validates values against the current active fields (required, type, length, e-mail, date, options) and writes request, values and event atomically. Validation errors return SQLSTATE 22023 with `{ field_key: message }` in DETAIL.
- `authenticated` has only SELECT on these tables. RLS: staff see all requests; requesters see only their own; values follow the request; `internal` events are staff-only. Counters are not exposed.
- The server action validates first with a Zod schema built from the same metadata (`src/lib/requests/form-schema.ts`); the database validates again.

## Open items

- **Foreign keys into shared tables** — catalog (Phase 3): services reference requester departments with `ON DELETE RESTRICT`, so a corporate `public.dpto` row that has GC services cannot be deleted (deactivate it in GC instead); `created_by`/`updated_by` use `ON DELETE SET NULL`. Requests (Phase 4): `ON DELETE RESTRICT` to `public.users`, with requester name/e-mail/department snapshotted on the request (decided 2026-10-14).
