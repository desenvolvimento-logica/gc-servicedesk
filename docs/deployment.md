# Deployment checklist — GC Service Desk

Hosting: Vercel. Database/Auth: the existing unified office Supabase project (`olyvjnqmrzkziirzbmhi`), which **is production** (see `environment-decisions.md`). No secrets belong in this file.

## 1. Database (applied in this order)

| # | Migration | Verification |
|---|---|---|
| 1 | `20261013160000_gestao_cadastros_roles_and_requester_departments` | `supabase/verification/…check.sql` |
| 2 | `20261013180000_gestao_cadastros_service_catalog` | idem |
| 3 | `20261014120000_gestao_cadastros_requests` | idem |
| 4 | `20261014150000_gestao_cadastros_request_workflow` | idem |
| 5 | `20261014180000_gestao_cadastros_corrections` | idem |
| 6 | `20261015090000_gestao_cadastros_reports` | idem |
| 7 | `20261015120000_gestao_cadastros_user_admin` | idem |
| 8 | `20261015150000_gestao_cadastros_companies` | idem |
| 9 | `20261019120000_gestao_cadastros_company_accounting` | idem — after deploying, run **Sincronização completa** once (Administração → Empresas) |
| 10 | `20261019150000_gestao_cadastros_other_departments` | idem |
| 11 | `20261019170000_gestao_cadastros_request_comments` | idem |

Migrations are applied by hand in the Supabase SQL Editor after review (never `supabase db push`: the project is shared with other apps). Each has a rollback in `supabase/rollbacks/`. Full audit: `supabase/verification/phase8_security_audit.check.sql`.

## 2. Supabase Auth (shared project — change nothing else)

- Provider **Azure (Microsoft Entra ID)** is already enabled for the office; tenant restriction is configured there.
- Redirect URL allow-list must contain `https://gc-servicedesk.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback` for development). Add the production custom domain here if one is used later.
- Never change the shared **Site URL**.

## 3. Vercel project

- Project **`gc-servicedesk`** in the Vercel team **`luz-ia`**, connected to `desenvolvimento-logica/gc-servicedesk` (a push to `main` deploys to production); framework **Next.js**, **pnpm**, Node.js **24.x**.
- `vercel.json` sets the framework to **Next.js** (the project was created with the "Other" preset, which fails with *No Output Directory named "public"*).
- Production aliases: `gc-servicedesk.vercel.app` (the one allow-listed in Supabase Auth — use this URL), `gc-servicedesk-luz-ia.vercel.app`, `gc-servicedesk-git-main-luz-ia.vercel.app`. Signing in through the other aliases fails because their callbacks are not allow-listed.
- Local link: `vercel link --project gc-servicedesk --scope luz-ia` (creates the git-ignored `.vercel/` and adds a `VERCEL_OIDC_TOKEN` to `.env.local`).
- Environment variables (Production; Preview only if previews are allow-listed, which they are not today):

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://olyvjnqmrzkziirzbmhi.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → *publishable* key | public by design; **never** a `sb_secret_…`/service-role key (the app refuses to start with one) |

Both were added to **Production** on 2026-10-15 (`vercel env add … production`). Builds fail with a ZodError on these names when they are missing.

Server-only (Acessórias company sync — **never** `NEXT_PUBLIC_*`):

| Name | Value |
|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → *secret* key (`sb_secret_…`); used only by the company sync |
| `ACESSORIAS_API_TOKEN` | Acessórias → ⚙ → API Token |
| `CRON_SECRET` | random string ≥ 32 chars; Vercel Cron sends it to `/api/cron/companies-sync` |

`vercel.json` schedules the sync daily at 09:00 UTC (06:00 São Paulo).

## 4. Before release (with approval)

1. Grant the operator/administrator roles in **Administração → Usuários** and check the requester departments in **Administração → Departamentos**.
2. ~~Remove test data~~ — **done on 2026-10-15** with `supabase/maintenance/prelaunch_cleanup.sql` in mode `all` (every test request removed, numbering restarted at `GC-2026-000001`). It must never be run again.
3. ~~Confirm the catalog~~ — done 2026-10-15 (roles and catalog reviewed). **Released for use.**

## 5. After each production deploy (smoke test)

- `/login` loads and "Entrar com Microsoft" signs in and returns to the Painel.
- A requester sees only their department's services and only their own requests.
- An operator sees the Fila, can assign/start/close; the CSV export downloads.
- Response headers include `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

Rollback of the app: Vercel → Deployments → previous deployment → *Promote to Production* (instant; the database is unaffected).

## 6. Automated tests

- `pnpm check` — typecheck, lint, unit tests and build.
- `pnpm test:e2e` — Playwright on `http://localhost:3000`. Signed-in tests reuse sessions saved once with `pnpm e2e:login` (staff) and `pnpm e2e:login:requester` (git-ignored in `e2e/.auth/`); without them those tests are skipped. **The staff flow writes real, permanent requests marked "TESTE E2E"** and is skipped unless `E2E_WRITE=1` is set; after launch, avoid it in production (no cleanup is possible anymore).
