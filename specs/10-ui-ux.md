# 10 — UI/UX

## Product character
Internal enterprise application for frequent operational use.

UI should be:
- clean;
- modern;
- sober;
- desktop-first but responsive;
- optimized for repetitive tasks;
- clear about status and ownership;
- free of unnecessary visual effects.

## Language
User-facing UI: Brazilian Portuguese.
Code and technical identifiers: English.

## Requester screens
- Login / Microsoft SSO entry.
- Home/dashboard.
- Nova solicitação.
- Minhas solicitações.
- Detalhe da solicitação.

## Operator screens
- Operational dashboard.
- All requests / queue.
- Request detail.
- Search/filter controls.
- Assignment and status actions.
- Internal notes.
- Reports/indicators.

## Administrator screens
- Users.
- Departments.
- Services.
- Service field builder/configuration.

## Dynamic request UX
Recommended sequence:
1. Service selection.
2. Load service description/instructions.
3. Render only relevant configured fields.
4. Show required state clearly.
5. Show validation next to fields.
6. Confirm successful creation with request identifier.

## Status UX
Use consistent labels and visual treatment for Aberta, Em andamento and Concluída/Encerrada.

## Accessibility
Use semantic HTML, labels, keyboard-accessible controls, focus handling and accessible shadcn primitives where practical.
