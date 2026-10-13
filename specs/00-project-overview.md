# 00 — Project Overview

## Goal
Replace the current VIP Acessórios request workflow with an internal, configurable service desk used by Fiscal, Contábil and DP to request services from Gestão de Cadastro.

## Core outcomes
- Standardized requests instead of free-form tickets.
- Department-aware service catalog.
- Dynamic service-specific required fields.
- One request = one service.
- Request ownership, assignment, status and full history.
- Explicit correction/rework requests for quality measurement.
- Operational filters, indicators and export.
- Admin-managed services and fields without code changes.

## Roles
### Requester
Belongs to a requester department, creates requests and sees only their own requests.

### Gestão de Cadastro Operator
Sees all operational requests, assigns, updates status, writes internal notes and closes requests.

### Administrator
Manages users, departments, services and service fields.

## Initial requester departments
- Fiscal
- Contábil
- DP

Departments are data, not hard-coded application logic.

## Core business rules
1. One request represents exactly one service.
2. Required fields depend on the selected service.
3. Required fields must be validated before submission.
4. Every request has requester, requester department, timestamps and operational history.
5. Once closed, a requester cannot reopen the request.
6. A correction/refaction is a new request using the dedicated correction/rework service.
7. Requesters cannot edit or view other users' requests.
8. Audit records are preserved.

## Version 1 scope
- Microsoft SSO.
- Profiles/roles/departments.
- Configurable service catalog.
- Dynamic form engine.
- Request creation and tracking.
- Operational queue and assignment.
- Status workflow.
- Internal notes and audit history.
- Correction/rework tracking.
- Search, filters, indicators and export.
- Administration screens.

## Explicitly out of scope unless later approved
- External customer portal.
- Native mobile app.
- Local password auth.
- AI classification/chatbot.
- Direct Domínio integration.
- Acessórias API integration.
- Automatic Microsoft Graph department synchronization.
- WhatsApp.
- Billing or SaaS multi-tenancy.
