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

## Development

Requirements: Node.js 24 LTS and pnpm (via Corepack: `corepack enable pnpm`).

```bash
pnpm install
cp .env.example .env.local   # fill in values; never commit
pnpm dev                     # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `pnpm typecheck` | Generate route types and run `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit/component tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright; builds and starts the app on port 3100). First run: `pnpm exec playwright install chromium` |
| `pnpm build` | Production build |
| `pnpm check` | typecheck + lint + test + build |

Visual references live in `docs/mockups/`. Brand assets are in `src/assets/brand/`.
