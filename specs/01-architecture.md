# 01 — Architecture

## Standard stack
- Language: TypeScript
- Runtime: Node.js LTS
- Framework: Next.js, App Router
- UI: React + Tailwind CSS + shadcn/ui + Lucide
- Forms: React Hook Form + Zod
- Database/platform: existing unified Supabase + PostgreSQL
- Auth: Microsoft Entra ID SSO integrated with the chosen Supabase auth flow
- Storage: Supabase Storage when attachments are enabled
- Tables: TanStack Table
- Tests: Vitest + Playwright
- Package manager: pnpm
- Deployment target: Vercel + existing Supabase project

## Architectural boundaries
Suggested feature-first structure:

```text
src/
  app/
  components/
  features/
    auth/
    users/
    departments/
    services/
    requests/
    reports/
    audit/
  lib/
    supabase/
    auth/
    validation/
  services/
  types/

supabase/
  migrations/
  seed/

tests/
```

## Application model
The application is a full-stack Next.js application. Do not create a separate backend service unless a future requirement justifies it.

Prefer:
- Server Components for server-rendered read flows.
- Server Actions or Route Handlers for mutations/API surfaces where appropriate.
- Server-side Supabase clients for privileged/session-aware operations.
- Browser Supabase client only for operations allowed by RLS.

## Security boundary
The browser is untrusted.

Do not rely on:
- hidden buttons;
- disabled controls;
- client route guards;
- client-supplied role/department/requester IDs.

Authorization must be derived from the authenticated identity and enforced server/database-side.

## Shared Supabase constraint
The database is shared by multiple internal applications. Do not create generic tables without an approved namespace strategy.

Preferred approach: dedicated PostgreSQL schema `gestao_cadastros`.
Alternative: consistently prefixed tables in `public`.

The project owner must confirm the strategy before the first migration.

## Future integrations
Architecture must remain compatible with Power BI, Power Automate, Teams, Outlook and Acessórias APIs, but do not implement them in V1 unless requested.
