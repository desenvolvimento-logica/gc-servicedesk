# 07 — Requests and Workflow

## Core invariant
**One request = one service.** A request must never aggregate different service types.

## Creation
On successful submission record automatically: requester, requester department, selected service, opening timestamp, service-specific values, Observações, initial status and an audit event.

Do not accept requester identity/department from the browser when they can be derived from the authenticated profile.

## Statuses
Initial vocabulary:
- Aberta
- Em andamento
- Concluída / Encerrada

Claude Code must propose whether statuses are an enum, lookup table or another model before migration creation.

## Assignment
Operators can assign a request to a Gestão de Cadastro operator and change assignment according to operational permissions. Assignment changes must be audited.

## Closing
Only authorized operator/admin roles can close a request. When closed: completed timestamp is recorded, audit event is appended, requester cannot reopen it and requester cannot mutate protected request data.

## New work after closure
A new need requires a new request. Rework/correction must be a new `Correção de Cadastro / Refazer` request, optionally linked to the original request.

## Correction/rework reporting
Store enough information to report new vs correction, original request where known, original executing operator where traceable and reason for correction.

## Request number
Human-readable format is not yet approved. Before implementation, propose a simple format (for example `GC-YYYY-NNNNNN`) and ask for approval.

## Requester access
Requester sees only own requests unless a later requirement explicitly changes this.
