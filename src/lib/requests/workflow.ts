import type { RequestStatus } from "./status";

/**
 * Forward-only status transitions (approved 2026-10-14). Mirrors
 * `public.gestao_cadastros_change_request_status`, which enforces them.
 */
const transitions: Record<RequestStatus, readonly RequestStatus[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["closed"],
  closed: [],
};

export const nextStatuses = (status: RequestStatus): readonly RequestStatus[] => transitions[status];

export const canTransition = (from: RequestStatus, to: RequestStatus) => transitions[from].includes(to);

/** Closed requests accept no further changes (assignment, status or notes). */
export const isLocked = (status: RequestStatus) => status === "closed";

export const NOTE_MAX_LENGTH = 5000;
