import type { FieldValidation } from "./field-row";
import type { FieldType, ServiceKind } from "./field-types";
import type { FieldOption } from "./schemas";

/** Serializable catalog shapes for the administration screens. */

export type AdminDepartment = {
  id: number;
  name: string;
  /** Has a gestao_cadastros_requester_departments row (active or not). */
  isRequesterDepartment: boolean;
  active: boolean;
  sortOrder: number;
};

export type AdminServiceSummary = {
  id: string;
  dptoId: number;
  departmentName: string;
  name: string;
  description: string | null;
  kind: ServiceKind;
  active: boolean;
  sortOrder: number;
  fieldCount: number;
  activeFieldCount: number;
  updatedAt: string;
};

export type AdminServiceField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  options: FieldOption[];
  placeholder: string | null;
  helpText: string | null;
  validation: FieldValidation;
  sortOrder: number;
  active: boolean;
};

export type AdminService = Omit<AdminServiceSummary, "fieldCount" | "activeFieldCount"> & {
  fields: AdminServiceField[];
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };
