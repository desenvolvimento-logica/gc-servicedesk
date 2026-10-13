# 03 — Authentication

## Authentication source
Microsoft Entra ID SSO is mandatory.

Do not implement:
- email/password registration;
- local password login;
- public signup;
- magic-link login unless explicitly approved later.

## Required discovery before implementation
Ask:
1. Does an Entra App Registration already exist?
2. Tenant ID?
3. Client/Application ID?
4. Is a client secret required for the chosen Supabase integration?
5. Allowed corporate domain(s)?
6. Single-tenant only?
7. Local callback URL?
8. Production callback URL?
9. Production application URL?

Do not invent any values.

## Identity vs authorization
Entra answers: **Who is this user?**
The application database answers: **What can this user do?**

After successful authentication, resolve the identity to an internal active profile. If no authorized active profile exists, deny access and show a clear Portuguese message instructing the user to contact an administrator.

## Tenant/domain restriction
Support restriction to the approved company tenant/domain. Exact enforcement must be confirmed from the App Registration/Supabase configuration.

## Session handling
Use the recommended Supabase + Next.js server/session pattern for the installed versions. Protected routes must revalidate authentication server-side.

## Provisioning
Do not silently grant roles based only on email domain.
Choose before production rollout between pre-provisioned profiles or a pending/disabled profile created after first authenticated access.
