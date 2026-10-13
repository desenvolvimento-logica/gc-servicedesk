# Environment Decisions (Phase 0)

Status: Phase 0 complete.
Last updated: 2026-10-13.

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

## Open items

- **Foreign keys into shared tables** — a FK from GC tables to `public.users` / `public.dpto` with the default `ON DELETE NO ACTION` would block other apps from deleting a user/department that has GC requests. Proposed: keep the FK for integrity but snapshot requester name/email/department on the request, and decide `ON DELETE` behavior (`SET NULL` vs `RESTRICT`) during the Phase 3/4 migration review.
