# 06 — Dynamic Form Engine

## Requirement
Do not create a React form component per service. The selected service must load its active field definitions and render the form from metadata.

## Minimum supported field types
- text
- textarea
- number
- date
- email
- select
- multiselect
- boolean
- file, after attachment rules are confirmed

## Field metadata
Support at least stable `field_key`, label, type, required, options/configuration, placeholder, help text, validation rules, sort order and active status.

## Rendering
Expected flow:
1. Resolve authenticated requester/profile.
2. Load active services allowed for requester's department.
3. Requester selects one service.
4. Load ordered active fields for that service.
5. Build validation schema from trusted server/database metadata.
6. Render corresponding controls.
7. Validate client-side for UX.
8. Revalidate server-side before persistence.

## Submission security
Never trust a client-submitted field definition or required flag. On submission, the server must load the service definition and validate submitted values against the current approved metadata/version.

## Historical meaning
The submitted request must retain enough information to display exactly what the requester submitted even if an admin later edits labels/options/required status. Follow the approved snapshot/versioning strategy from the database spec.

## Unknown field types
An administrator can add services without code changes, but introducing a brand-new UI control type may require code. The admin UI should only offer supported field types.

## Validation examples
- required text cannot be blank after trimming;
- email must be valid;
- number must parse to allowed numeric form;
- date must be valid;
- select/multiselect values must belong to configured options when applicable.
