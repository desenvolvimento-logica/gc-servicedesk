# GC Service Desk

Internal service desk for the **Gestão de Cadastro** department at Lógica Assessoria Contábil.

## Documentation
- `CLAUDE.md` — permanent operating rules for Claude Code.
- `docs/SRS_Gestao_de_Cadastros_v1.0.md` — authoritative technical SRS.
- `specs/` — implementation specifications split by domain for focused coding-agent context.

## Stack
TypeScript · Node.js · Next.js · React · Tailwind · shadcn/ui · Supabase/PostgreSQL · Microsoft Entra ID SSO.

## Important
This project must use the office's **existing unified Supabase project**. Do not create a new Supabase project. Environment and Entra credentials are intentionally not stored in the repository.

Start implementation with `specs/12-implementation-roadmap.md` and Phase 0 discovery.
