import type { NextRequest } from "next/server";

import { toCsv } from "@/lib/csv";
import { buildExportTable } from "@/lib/requests/report-export";
import { parseReportFilters } from "@/lib/requests/report-filters";
import { getSession } from "@/server/auth/session";
import { loadExportRows, MAX_EXPORT_ROWS } from "@/server/reports/queries";

/**
 * CSV export of the report (operators and administrators). Same filters as
 * the report page; with a single service selected, its dynamic fields are
 * added as columns.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session.status === "unauthenticated") return text("Faça login para exportar.", 401);
  if (session.status !== "authorized" || !session.viewer.isStaff) return text("Você não tem permissão para exportar.", 403);

  const filters = parseReportFilters(Object.fromEntries(request.nextUrl.searchParams));
  const result = await loadExportRows(filters);
  if (!result.ok) {
    return text(
      `A exportação passa de ${MAX_EXPORT_ROWS.toLocaleString("pt-BR")} solicitações. Reduza o período ou filtre por serviço.`,
      413,
    );
  }

  const filename = `solicitacoes_${filters.from}_${filters.to}.csv`;
  return new Response(toCsv(buildExportTable(result.rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
