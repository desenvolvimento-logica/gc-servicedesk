# 12 — Implementation Roadmap

## Phase 0 — Discovery and environment
Do not write environment-sensitive code first.

Tasks:
- inspect repository;
- confirm Node/pnpm versions;
- obtain Supabase connection metadata;
- inspect unified Supabase existing schema;
- confirm namespace strategy;
- confirm dev/staging/prod topology;
- confirm Entra App Registration details;
- identify initial administrator and operator users;
- resolve service field option lists/types.

Exit: environment decisions documented; no guessed credentials.

## Phase 1 — Foundation
- Initialize Next.js TypeScript app.
- Enable strict TypeScript.
- Configure Tailwind/shadcn.
- Establish source structure.
- Add `.env.example` with variable names only.
- Add lint/typecheck/test scripts.
- Add basic layout and error boundaries.

## Phase 2 — Authentication and authorization
- Microsoft SSO.
- Internal profile resolution.
- Roles/departments.
- Protected routes.
- RLS/server authorization baseline.

## Phase 3 — Service catalog administration
- Departments.
- Services.
- Service fields.
- Activate/deactivate behavior.
- Initial seed catalog.

## Phase 4 — Dynamic request creation
- Department service selection.
- Dynamic field renderer.
- Server-generated validation.
- Common Observações.
- Attachments after rules are confirmed.
- Request persistence/history.

## Phase 5 — Operational workflow
- Queue.
- Pagination/search.
- Assignment.
- Status changes.
- Internal notes.
- Closing.
- Audit timeline.

## Phase 6 — Correction/rework
- Dedicated correction service.
- Original request link.
- Original operator traceability.
- Rework metrics.

## Phase 7 — Reporting/export
- Required filters.
- Indicators.
- CSV export.
- Query/index tuning.

## Phase 8 — Hardening and release
- Full critical-path tests.
- RLS/security review.
- Migration review.
- Performance/index review.
- Production environment configuration.
- Deployment checklist.

## Rule for Claude Code
Do not implement multiple phases as one giant task. Work in small reviewable slices and stop for approval at migrations, auth configuration and major architecture boundaries.
