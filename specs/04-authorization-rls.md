# 04 — Authorization and RLS

## Roles
### Requester
- Create a request for self.
- Read own requests.
- Read requester-visible history on own requests.
- Cannot read internal notes.
- Cannot read or edit another requester's requests.
- Cannot reopen closed requests.

### Operator
- Read operational requests across requester departments.
- Assign/unassign requests.
- Change status.
- Add internal notes.
- Close requests.
- Read operational history.

### Administrator
- Manage application configuration and users.
- Access requests/history as required for administration/audit.

## Department behavior
Requester service visibility is based on the department stored in the internal authorization profile, not on a client-submitted department value.

## Server-side enforcement
Every mutation must derive identity from the authenticated session. Never trust payload fields such as requester_id, requester_department_id, actor_user_id or administrative role when they can be derived from session/profile.

## RLS goals
Use Supabase RLS where compatible with the final schema. Policies should enforce requester ownership, operator operational access, admin-only configuration and restricted internal history/notes.

## Production policy rule
Claude Code must present proposed RLS policies for review before applying them to production.

## Service role
Service-role credentials are server-only. Never expose them through `NEXT_PUBLIC_*` variables or browser bundles.
