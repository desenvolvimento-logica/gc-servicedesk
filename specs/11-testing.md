# 11 — Testing

## Tools
Preferred:
- Vitest for unit/integration tests.
- Playwright for end-to-end tests.

## Mandatory critical scenarios
1. Microsoft-authenticated requester can enter when authorized.
2. Unauthorized/non-approved identity is denied.
3. Requester sees only services for their department.
4. Dynamic form renders correct service fields.
5. Missing required fields block submission server-side.
6. Successful request records requester/department/time automatically.
7. Requester can read own request.
8. Requester cannot read another user's request.
9. Requester cannot access internal notes.
10. Operator can list, filter and open all operational requests.
11. Operator can assign a request.
12. Operator can change status.
13. Status and assignment changes generate audit events.
14. Operator can close a request.
15. Requester cannot reopen a closed request.
16. Correction/rework creates a new request and can link to original.
17. Administrator can create a service and fields without code changes.
18. Newly configured service renders through the same generic form engine.
19. Export respects authorization/filter scope.
20. RLS/server authorization prevents direct unauthorized database/API access.

## Quality gates
Before a requested feature is considered complete, run as applicable:
- TypeScript typecheck;
- ESLint;
- unit/integration tests;
- Playwright critical path tests;
- `next build`.

## Security testing
Tests should attempt unauthorized operations, not merely verify hidden UI controls.
