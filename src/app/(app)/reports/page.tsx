import { CircleCheckBig, CircleDot, Clock, Download, FileText, Filter, RotateCcw, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ReportFiltersForm } from "@/components/reports/report-filters-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPTY_VALUE, formatIsoDate } from "@/lib/requests/format";
import { parseReportFilters, reportFiltersToSearch, reportPeriodLabels } from "@/lib/requests/report-filters";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/session";
import { getReportSummary, type ReportSummary } from "@/server/reports/queries";
import { listQueueServices } from "@/server/requests/queue-queries";

export const metadata: Metadata = {
  title: "Relatórios",
};

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ReportsPage({ searchParams }: ReportsPageProps) {
  return (
    <>
      <PageHeader title="Relatórios" breadcrumbs={[{ label: "Relatórios" }]} />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <ReportContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

const numberFormat = new Intl.NumberFormat("pt-BR");
const hoursFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

/** "26,5 h" or "3,2 dias" for longer times. */
function formatHours(hours: number | null): string {
  if (hours === null) return EMPTY_VALUE;
  return hours >= 48 ? `${hoursFormat.format(hours / 24)} dias` : `${hoursFormat.format(hours)} h`;
}

const share = (part: number, total: number) => (total > 0 ? percentFormat.format(part / total) : EMPTY_VALUE);

async function ReportContent({ searchParams }: ReportsPageProps) {
  const viewer = await requireStaff();
  const filters = parseReportFilters(await searchParams);
  const [summary, services] = await Promise.all([getReportSummary(filters), listQueueServices()]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Filter aria-hidden className="size-5 text-brand-ink" />
            Filtros
          </CardTitle>
          <Button asChild variant="outline">
            {/* Plain link: the browser downloads the file. */}
            <a href={`/reports/export${reportFiltersToSearch(filters)}`} download>
              <Download aria-hidden />
              Exportar CSV
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <ReportFiltersForm
            key={reportFiltersToSearch(filters)}
            filters={filters}
            departments={viewer.requestDepartments}
            services={services}
          />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {reportPeriodLabels[filters.period]}: solicitações abertas de {formatIsoDate(filters.from)} a {formatIsoDate(filters.to)}.
      </p>

      <Indicators summary={summary} />

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownCard
          title="Por departamento"
          icon={FileText}
          columns={["Departamento", "Solicitações", "%"]}
          rows={summary.by_department.map((row) => [row.name ?? EMPTY_VALUE, numberFormat.format(row.total), share(row.total, summary.total)])}
        />
        <BreakdownCard
          title="Por operador (responsável atual)"
          icon={Clock}
          columns={["Operador", "Solicitações", "Concluídas", "Tempo médio"]}
          rows={summary.by_operator.map((row) => [
            row.name ?? "Não atribuído",
            numberFormat.format(row.total),
            numberFormat.format(row.closed),
            formatHours(row.avg_resolution_hours),
          ])}
        />
      </div>

      <BreakdownCard
        title="Por serviço"
        icon={FileText}
        columns={["Serviço", "Departamento", "Solicitações", "Concluídas", "Tempo médio"]}
        labelColumns={2}
        rows={summary.by_service.map((row) => [
          row.name,
          row.department,
          numberFormat.format(row.total),
          numberFormat.format(row.closed),
          formatHours(row.avg_resolution_hours),
        ])}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownCard
          title="Retrabalho por operador da original"
          icon={RotateCcw}
          columns={["Operador da original", "Correções"]}
          rows={summary.rework.by_original_operator.map((row) => [row.name ?? "Não identificado", numberFormat.format(row.total)])}
          empty="Nenhuma correção no período."
        />
        <BreakdownCard
          title="Retrabalho por serviço da original"
          icon={RotateCcw}
          columns={["Serviço da original", "Correções"]}
          rows={summary.rework.by_original_service.map((row) => [row.name ?? EMPTY_VALUE, numberFormat.format(row.total)])}
          empty="Nenhuma correção no período."
        />
      </div>
    </>
  );
}

function Indicators({ summary }: { summary: ReportSummary }) {
  const items: { label: string; value: string; hint: string; icon: LucideIcon; tone: string }[] = [
    { label: "Total", value: numberFormat.format(summary.total), hint: "Abertas no período", icon: FileText, tone: "bg-brand-soft text-brand-ink" },
    {
      label: "Abertas",
      value: numberFormat.format(summary.by_status.open),
      hint: "Aguardando atendimento",
      icon: CircleDot,
      tone: "bg-status-info-soft text-status-info",
    },
    {
      label: "Em andamento",
      value: numberFormat.format(summary.by_status.in_progress),
      hint: "Sendo tratadas",
      icon: Clock,
      tone: "bg-status-warning-soft text-status-warning",
    },
    {
      label: "Concluídas",
      value: numberFormat.format(summary.by_status.closed),
      hint: share(summary.by_status.closed, summary.total) + " do total",
      icon: CircleCheckBig,
      tone: "bg-status-success-soft text-status-success",
    },
    {
      label: "Tempo médio de resolução",
      value: formatHours(summary.avg_resolution_hours),
      hint: "Da abertura à conclusão",
      icon: Timer,
      tone: "bg-muted text-muted-foreground",
    },
    {
      label: "Correções / Refazer",
      value: numberFormat.format(summary.rework.corrections),
      hint: share(summary.rework.corrections, summary.total) + " do total",
      icon: RotateCcw,
      tone: "bg-status-danger-soft text-status-danger",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex items-start gap-4">
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", item.tone)}>
              <item.icon aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-2xl font-bold tabular-nums">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type BreakdownCardProps = {
  title: string;
  icon: LucideIcon;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  /** Leading text columns; the others are numeric and align right. */
  labelColumns?: number;
  empty?: string;
};

function BreakdownCard({ title, icon: Icon, columns, rows, labelColumns = 1, empty = "Nenhuma solicitação no período." }: BreakdownCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Icon aria-hidden className="size-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={column} className={index >= labelColumns ? "text-right" : undefined}>
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, index) => (
                    <TableCell key={columns[index]} className={index >= labelColumns ? "text-right tabular-nums" : undefined}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
