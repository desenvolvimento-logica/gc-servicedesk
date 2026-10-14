import { CircleCheckBig, CircleDot, Clock, Filter, Inbox, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/requests/pagination";
import { QueueFiltersForm } from "@/components/requests/queue-filters-form";
import { RequestsTable } from "@/components/requests/requests-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseQueueFilters, queueFiltersToSearch, type QueueFilters } from "@/lib/requests/queue-filters";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/session";
import { getQueueCounts, listOperators, listQueue, listQueueServices } from "@/server/requests/queue-queries";

export const metadata: Metadata = {
  title: "Fila de Atendimento",
};

type QueuePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function QueuePage({ searchParams }: QueuePageProps) {
  return (
    <>
      <PageHeader title="Fila de Atendimento" breadcrumbs={[{ label: "Fila de Atendimento" }]} />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <Suspense fallback={<Skeleton className="h-28 rounded-xl" />}>
          <Indicators />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <QueueContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function Indicators() {
  const counts = await getQueueCounts();
  const items: { label: string; value: number; hint: string; icon: LucideIcon; tone: string }[] = [
    { label: "Abertas", value: counts.open, hint: "Aguardando início do atendimento", icon: CircleDot, tone: "bg-status-info-soft text-status-info" },
    { label: "Em andamento", value: counts.inProgress, hint: "Sendo tratadas pela equipe", icon: Clock, tone: "bg-status-warning-soft text-status-warning" },
    { label: "Sem responsável", value: counts.unassigned, hint: "Em aberto e não atribuídas", icon: UserX, tone: "bg-muted text-muted-foreground" },
    { label: "Concluídas hoje", value: counts.closedToday, hint: "Finalizadas no dia de hoje", icon: CircleCheckBig, tone: "bg-status-success-soft text-status-success" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex items-start gap-4">
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", item.tone)}>
              <item.icon aria-hidden className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-3xl font-bold tabular-nums">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function QueueContent({ searchParams }: QueuePageProps) {
  const viewer = await requireStaff();
  const filters = parseQueueFilters(await searchParams);
  const [result, operators, services] = await Promise.all([listQueue(filters), listOperators(), listQueueServices()]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Filter aria-hidden className="size-5 text-brand-ink" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QueueFiltersForm
            key={queueFiltersToSearch({ ...filters, page: 1 })}
            filters={filters}
            departments={viewer.requestDepartments}
            services={services}
            operators={operators}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Inbox aria-hidden className="size-5" />
            Solicitações na fila
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.total === 0 ? (
            <EmptyState icon={Inbox} title="Nenhuma solicitação encontrada" description="Ajuste os filtros para ver outras solicitações." />
          ) : (
            <div className="flex flex-col gap-4">
              <RequestsTable requests={result.items} showAssignee />
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                hrefFor={(page) => pageHref(filters, page)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

const pageHref = (filters: QueueFilters, page: number) => `/queue${queueFiltersToSearch({ ...filters, page })}`;
