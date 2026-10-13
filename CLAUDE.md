# CLAUDE.md — GC Service Desk

## Project
Internal service desk for Lógica Assessoria Contábil's Gestão de Cadastro department.

The authoritative requirements live in `docs/SRS_Gestao_de_Cadastros_v1.0.md` and the modular specifications under `specs/`.

## Mandatory stack
- TypeScript
- Node.js LTS
- Next.js App Router
- React
- Tailwind CSS
- shadcn/ui
- Lucide Icons
- Supabase/PostgreSQL
- Microsoft Entra ID SSO
- React Hook Form + Zod
- Vitest + Playwright
- pnpm

## Non-negotiable rules
1. Never create a new Supabase project. Use the existing unified office Supabase project.
2. Before any Supabase connection or migration, ask for the required project/environment information.
3. Never run migrations against an unknown environment.
4. Never implement local username/password authentication. Authentication is Microsoft Entra ID SSO.
5. Before SSO implementation, ask for Tenant ID, Client ID/App Registration and callback configuration as required.
6. Never hard-code departments, services or service-specific form fields.
7. Dynamic request forms must be rendered from database metadata.
8. One request represents exactly one service.
9. Closed requests cannot be reopened by the requester.
10. Corrections/rework are new requests of the dedicated correction/rework type.
11. Authorization must be enforced server-side/database-side; UI hiding is not security.
12. Use RLS where appropriate and request approval before applying production policies.
13. Never expose service-role keys or secrets to the browser.
14. Never commit secrets, connection strings, tenant secrets or `.env*` files containing credentials.
15. Preserve audit history; operational requests and audit events are not deleted through normal flows.
16. Prefer deactivation over deletion for referenced configuration.
17. Preserve historical meaning when service definitions change.
18. Use TypeScript strict mode. Avoid `any` unless unavoidable and documented.
19. Validate all important inputs server-side with Zod or equivalent typed schemas.
20. Keep business logic out of presentational components.

## Workflow
Before implementing a module:
1. Read this file.
2. Read the relevant file under `specs/`.
3. Inspect the current repository and relevant database definitions.
4. Identify unresolved decisions.
5. Propose a short implementation plan: files, DB changes, security implications, tests.
6. For migrations, authentication configuration or major architecture changes, wait for approval.
7. Implement only the requested scope.
8. Run typecheck, lint, relevant tests and build.
9. Report what changed, tests run, unresolved decisions and manual configuration required.

## Environment-sensitive work
Do not guess credentials or infrastructure. Ask only for the information needed for the current phase.

## UI language
User-facing UI and messages: Brazilian Portuguese.
Technical identifiers and source code: English.

## Definition of done
A feature is done only when behavior matches specs, server-side auth/validation is correct, relevant tests pass, TypeScript/lint/build pass, migrations are version-controlled, no secrets were added, and documentation is updated when behavior changes.
