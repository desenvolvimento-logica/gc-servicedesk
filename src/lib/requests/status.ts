import type { StatusTone } from "@/components/status-badge";

/** Mirrors the database enum `public.gestao_cadastros_request_status`. */
export const REQUEST_STATUSES = ["open", "in_progress", "closed"] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const requestStatusLabels: Record<RequestStatus, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  closed: "Concluída",
};

export const requestStatusTones: Record<RequestStatus, StatusTone> = {
  open: "info",
  in_progress: "warning",
  closed: "success",
};

/** Mirrors the database enum `public.gestao_cadastros_request_event_type`. */
export const REQUEST_EVENT_TYPES = [
  "request_created",
  "status_changed",
  "assigned",
  "unassigned",
  "internal_note_added",
  "request_closed",
  "attachment_added",
] as const;

export type RequestEventType = (typeof REQUEST_EVENT_TYPES)[number];

export const requestEventLabels: Record<RequestEventType, string> = {
  request_created: "Solicitação aberta",
  status_changed: "Status alterado",
  assigned: "Responsável atribuído",
  unassigned: "Responsável removido",
  internal_note_added: "Observação interna",
  request_closed: "Solicitação concluída",
  attachment_added: "Anexo adicionado",
};
