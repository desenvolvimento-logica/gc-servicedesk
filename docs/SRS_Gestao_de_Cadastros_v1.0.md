# Software Requirements Specification (SRS)
## Internal Requests System — Gestão de Cadastro

**Organization:** Lógica Assessoria Contábil  
**Version:** 1.0  
**Status:** Ready for implementation planning

## 1. Purpose
Build an internal, configurable service desk to replace the current VIP Acessórios request flow used by Fiscal, Contábil and DP to request services from Gestão de Cadastro.

The application must standardize requests, render service-specific required fields dynamically, preserve operational history, support correction/rework measurement and provide filters, indicators and exports.

## 2. Technical baseline
- TypeScript
- Node.js LTS
- Next.js App Router
- React
- Tailwind CSS
- shadcn/ui
- Supabase/PostgreSQL
- Microsoft Entra ID SSO
- React Hook Form + Zod
- TanStack Table
- Vitest + Playwright
- pnpm
- Vercel as preferred application deployment target

## 3. Critical infrastructure requirements
1. Use the office's existing unified Supabase project.
2. Never create a new Supabase project.
3. Ask for Supabase environment information before database integration or migrations.
4. Use Microsoft Entra ID SSO; do not implement local username/password authentication.
5. Ask for Entra App Registration details before SSO implementation.
6. Never hard-code or commit credentials.
7. Because the Supabase project is shared, confirm a database namespace strategy before migrations.

## 4. Functional roles
### Requester
Belongs to Fiscal, Contábil or DP; creates requests, sees only services for their department and follows only their own requests.

### Gestão de Cadastro Operator
Views all operational requests, filters/searches, assigns requests, changes status, writes internal notes and closes requests.

### Administrator
Manages users, departments, services and configurable fields.

## 5. Core business rules
- One request represents exactly one service.
- Services and their fields are database-driven, never hard-coded forms.
- Required fields must be validated server-side.
- `Observações` is always available in addition to service-specific fields.
- Closed requests cannot be reopened by requesters.
- New work after closure requires a new request.
- Correction/rework requires a new `Correção de Cadastro / Refazer` request.
- Every important lifecycle event is audited.
- Requests/audit records are not physically deleted through normal workflows.
- Referenced configuration is normally deactivated instead of deleted.

## 6. Authentication and authorization
Authentication is Microsoft Entra ID SSO. Entra determines identity; the application database determines role, department and permissions.

All important authorization must be enforced server/database-side. RLS should be used where compatible with the final Supabase design. Requesters must never gain access to other users' requests or operator-only internal notes.

## 7. Configurable service catalog
The administrator must be able to create/edit/deactivate departments, services and service fields without source-code changes.

The initial service catalog and field lists are defined in `specs/05-service-catalog.md`.

## 8. Dynamic form engine
The application must generate request forms from `service_fields` metadata. Initial supported field types should include text, textarea, number, date, email, select, multiselect, boolean and file after attachment rules are confirmed.

Client-side validation is for UX; server-side validation is authoritative.

Historical requests must remain interpretable even when administrators later edit service definitions. The implementation must use an approved snapshot/versioning strategy.

## 9. Request lifecycle
Initial statuses:
- Aberta
- Em andamento
- Concluída / Encerrada

Operators can assign and process requests. Assignment and status changes must generate history events. Closing records the responsible user and timestamp and locks the request against requester reopening.

## 10. Correction / rework
Each requester department must have a `Correção de Cadastro / Refazer` service containing at least company name, company code, original service/request reference when available, reason for correction and observations.

The system must support reporting of new requests vs corrections/rework and original operator when traceable.

## 11. Audit/history
Maintain append-only history sufficient to determine who opened, assigned, changed status and closed each request and when.

Internal notes are restricted to authorized operator/admin roles and are not requester-visible.

## 12. Filters and reporting
Minimum filters:
- company name/code;
- requester department;
- service;
- new vs correction/rework;
- requester;
- status;
- opening/closing period;
- servicing/assigned operator.

Minimum indicators:
- volume by department;
- volume by service;
- volume by period;
- average service time;
- correction/rework percentage;
- rework distribution by original operator when traceable.

Authorized users must be able to export filtered data to CSV. The architecture must remain compatible with future Power BI use.

## 13. Non-functional requirements
- strict TypeScript;
- server-side pagination for large lists;
- indexed query paths;
- no full-table client-side filtering;
- secrets only in environment variables or approved secret stores;
- structured errors and Portuguese user-facing messages;
- accessible semantic UI practices;
- version-controlled database migrations;
- no production migration without explicit approval.

## 14. Testing acceptance baseline
Critical flows must cover authentication, department-aware catalog visibility, dynamic field rendering, server validation, request ownership restrictions, operator assignment/status transitions, closed-request locking, correction/rework creation, audit history, internal-note privacy, admin service configuration and export authorization.

## 15. Implementation approach
Implementation must proceed by the phases in `specs/12-implementation-roadmap.md`, beginning with Phase 0 discovery. Claude Code must not attempt to build the entire application in one task.

Before environment-sensitive work, it must ask only for the missing information required for the current phase and must not invent credentials, infrastructure values or business option lists.

## 16. Detailed module specifications
- `specs/00-project-overview.md`
- `specs/01-architecture.md`
- `specs/02-database.md`
- `specs/03-authentication.md`
- `specs/04-authorization-rls.md`
- `specs/05-service-catalog.md`
- `specs/06-dynamic-form-engine.md`
- `specs/07-requests-workflow.md`
- `specs/08-audit-history.md`
- `specs/09-reports-export.md`
- `specs/10-ui-ux.md`
- `specs/11-testing.md`
- `specs/12-implementation-roadmap.md`

`CLAUDE.md` contains permanent coding-agent operating rules and must be read before implementation work.
