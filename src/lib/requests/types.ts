import type { FieldType, ServiceKind } from "@/lib/catalog/field-types";

import type { RequestFormField } from "./form-schema";
import type { RequestEventType, RequestStatus } from "./status";

export type EventVisibility = "requester" | "internal";

/** Serializable request shapes for the requester screens. */

export type RequestableService = {
  id: string;
  dptoId: number;
  name: string;
  description: string | null;
  kind: ServiceKind;
  fields: RequestFormField[];
};

export type RequestableDepartment = {
  id: number;
  name: string;
  services: RequestableService[];
};

export type RequestSummary = {
  id: string;
  requestNumber: string;
  serviceName: string;
  departmentName: string;
  companyName: string | null;
  status: RequestStatus;
  openedAt: string;
  updatedAt: string;
  assignedToName: string | null;
};

/** A submitted value with the field definition as it was at submission. */
export type SubmittedField = {
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  text: string | null;
  number: number | null;
  date: string | null;
  boolean: boolean | null;
  options: { value: string; label: string }[] | null;
};

/** Event payload fields relevant for display; absent when not applicable. */
export type RequestEventDetails = {
  fromStatus?: RequestStatus;
  toStatus?: RequestStatus;
  previousAssigneeName?: string;
  assigneeName?: string;
  /** Internal note text (staff only). */
  text?: string;
};

export type RequestEvent = {
  id: number;
  eventType: RequestEventType;
  visibility: EventVisibility;
  actorName: string | null;
  createdAt: string;
  details: RequestEventDetails;
};

export type Operator = { userId: number; name: string; email: string };

export type RequestDetail = RequestSummary & {
  serviceKind: ServiceKind;
  requesterName: string | null;
  requesterEmail: string | null;
  companyCode: string | null;
  assignedTo: number | null;
  completedAt: string | null;
  closedByName: string | null;
  values: SubmittedField[];
  events: RequestEvent[];
};

export type CreatedRequest = { id: string; requestNumber: string };
