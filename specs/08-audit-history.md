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

## Observações (comments) — since 2026-10-19
The team does not use staff-only notes. The request page has "Observações": comments visible to the requester and the staff, written by staff on any open request and by the requester on their own open requests (`comment_added`, requester-visible). They identify author and timestamp, are append-only and appear in the history. Closed requests accept no new comments.

## Internal notes (legacy)
Notes written before 2026-10-19 (`internal_note_added`) keep their staff-only visibility: they are never returned to requesters and are shown to staff marked "Interna". The app no longer creates them.

## Immutability
Do not update old audit events to represent new state. Append a new event.

## Data retention
No deletion policy was specified. Preserve request/audit history indefinitely for V1 unless the project owner later defines retention rules.
