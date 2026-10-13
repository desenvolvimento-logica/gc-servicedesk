# 02 — Database

## Critical rule
Use the office's existing unified Supabase project. Never create a new project.

Before database work, ask for:
- Project URL.
- Publishable/anon key for the current environment.
- Project reference.
- Whether Supabase CLI is already linked.
- Target environment.
- Permission to apply migrations.
- Namespace strategy.
- Existing shared profile/user/department tables that should be reused.

## Proposed domain entities
The final names/columns require review against the existing database.

### profiles
Internal authorization profile linked to Microsoft/Supabase identity.
Suggested fields: id, auth_user_id, email, display_name, department_id, role_id, active, created_at, updated_at.

### departments
Suggested fields: id, name, code, active, sort_order, created_at, updated_at.

### roles / permissions
Use a simple role model for V1 unless existing shared authorization tables already solve this.
Minimum roles: requester, operator, administrator.

### services
Suggested fields: id, department_id, name, description, category, request_kind, active, sort_order, created_at, updated_at.

### service_fields
Suggested fields: id, service_id, field_key, label, field_type, required, options/configuration, placeholder, help_text, validation_rules, sort_order, active, created_at, updated_at.

### requests
Suggested fields: id, request_number, service_id, requester_id, requester_department_id, status, assigned_to, request_type, original_request_id, observations, opened_at, updated_at, completed_at.

### request_field_values
Suggested fields: id, request_id, service_field_id, typed value representation, created_at, updated_at.
The typed storage strategy must be proposed before migrations and must not make common reporting impractical.

### request_history
Append-only operational audit stream with request_id, actor_user_id, event_type, previous_value, new_value, metadata, visibility and created_at.

### attachments
If approved: request_id, uploaded_by, storage_path, original_filename, mime_type, size_bytes, visibility and created_at.

## Historical configuration integrity
Admin edits must not alter historical meaning of submitted requests. Before implementation propose one approved approach: snapshot relevant metadata at submission, version service definitions, or equivalent immutable-history design.

## Deletion
- Requests: no physical deletion in normal UI.
- Audit events: no physical deletion in normal UI.
- Referenced services/fields/departments: deactivate rather than delete.

## Migrations
- Every DB change is version-controlled.
- Do not rewrite migrations already applied to shared environments.
- Use corrective migrations.
- Review SQL before applying.
- Never apply production migrations without explicit approval.

## Indexing targets
Plan indexes for requester, department, service, status, assignee, opened/completed dates, original request and common company-name/company-code query paths. Final indexes follow actual query shape.
