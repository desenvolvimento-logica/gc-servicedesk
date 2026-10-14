import type { FieldType, ServiceKind } from "@/lib/catalog/field-types";
import { serviceKindLabels } from "@/lib/catalog/field-types";

import { EMPTY_VALUE, formatDateTime, formatSubmittedField } from "./format";
import { requestStatusLabels, type RequestStatus } from "./status";
import type { SubmittedField } from "./types";

/** One request of the export, as returned by `gestao_cadastros_report_requests`. */
export type ExportRow = {
  requestNumber: string;
  serviceKind: ServiceKind;
  departmentName: string;
  serviceName: string;
  companyName: string | null;
  companyCode: string | null;
  status: RequestStatus;
  requesterName: string | null;
  requesterEmail: string | null;
  assignedToName: string | null;
  openedAt: string;
  completedAt: string | null;
  closedByName: string | null;
  originalRequestNumber: string | null;
  originalOperatorName: string | null;
  /** Null when values were not requested (no service selected). */
  fieldValues: (SubmittedField & { sortOrder: number })[] | null;
};

const decimalFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function resolutionHours(openedAt: string, completedAt: string | null): string {
  if (!completedAt) return "";
  return decimalFormat.format((new Date(completedAt).getTime() - new Date(openedAt).getTime()) / 3_600_000);
}

const FIXED_COLUMNS: { header: string; value: (row: ExportRow) => string }[] = [
  { header: "Protocolo", value: (row) => row.requestNumber },
  { header: "Tipo", value: (row) => serviceKindLabels[row.serviceKind] },
  { header: "Departamento", value: (row) => row.departmentName },
  { header: "Serviço", value: (row) => row.serviceName },
  { header: "Empresa", value: (row) => row.companyName ?? "" },
  { header: "Código da empresa", value: (row) => row.companyCode ?? "" },
  { header: "Status", value: (row) => requestStatusLabels[row.status] },
  { header: "Solicitante", value: (row) => row.requesterName ?? "" },
  { header: "E-mail do solicitante", value: (row) => row.requesterEmail ?? "" },
  { header: "Responsável", value: (row) => row.assignedToName ?? "" },
  { header: "Abertura", value: (row) => formatDateTime(row.openedAt) },
  { header: "Conclusão", value: (row) => (row.completedAt ? formatDateTime(row.completedAt) : "") },
  { header: "Concluída por", value: (row) => row.closedByName ?? "" },
  { header: "Tempo de resolução (h)", value: (row) => resolutionHours(row.openedAt, row.completedAt) },
  { header: "Solicitação original", value: (row) => row.originalRequestNumber ?? "" },
  { header: "Operador da original", value: (row) => row.originalOperatorName ?? "" },
];

type DynamicColumn = { fieldKey: string; label: string; sortOrder: number; fieldType: FieldType };

/**
 * Dynamic columns: every field submitted in the exported requests, keyed by
 * the immutable field_key. Rows come oldest first, so the most recent label
 * and order win when an administrator renamed or moved a field.
 */
function dynamicColumns(rows: readonly ExportRow[]): DynamicColumn[] {
  const columns = new Map<string, DynamicColumn>();
  for (const row of rows) {
    for (const value of row.fieldValues ?? []) {
      columns.set(value.fieldKey, {
        fieldKey: value.fieldKey,
        label: value.label,
        sortOrder: value.sortOrder,
        fieldType: value.fieldType,
      });
    }
  }
  return [...columns.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"));
}

/** Header + rows; dynamic field columns follow the fixed ones. */
export function buildExportTable(rows: readonly ExportRow[]): string[][] {
  const dynamic = dynamicColumns(rows);
  const header = [...FIXED_COLUMNS.map((column) => column.header), ...dynamic.map((column) => column.label)];

  const body = rows.map((row) => {
    const values = new Map((row.fieldValues ?? []).map((value) => [value.fieldKey, value]));
    return [
      ...FIXED_COLUMNS.map((column) => column.value(row)),
      ...dynamic.map((column) => {
        const value = values.get(column.fieldKey);
        if (!value) return "";
        const formatted = formatSubmittedField(value);
        return formatted === EMPTY_VALUE ? "" : formatted;
      }),
    ];
  });

  return [header, ...body];
}
