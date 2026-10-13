# 08 — Audit, History and Internal Notes

## Goal
Every request must have a reliable historical record.

At minimum the system must answer:
- who opened it;
- when it was opened;
- requester department;
- each status change and timestamp;
- who changed the status;
- assignment changes;
- who closed it;
- closing timestamp.

## Audit model
Prefer append-only history events.

Suggested event types:
- request_created
- status_changed
- assigned
- unassigned
- internal_note_added
- request_closed
- attachment_added
- administrative_correction, if later needed

## Visibility
History entries must support visibility or event classification so internal operator notes are never returned to requesters.

## Internal notes
Gestão de Cadastro operators can add internal observations. Internal notes are not requester-visible, identify author and timestamp, should not be silently edited/deleted through normal flows and should be included in authorized operational audit views.

## Immutability
Do not update old audit events to represent new state. Append a new event.

## Data retention
No deletion policy was specified. Preserve request/audit history indefinitely for V1 unless the project owner later defines retention rules.
