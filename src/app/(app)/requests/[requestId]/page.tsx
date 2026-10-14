import { FileText, History, Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { serviceKindLabels } from "@/lib/catalog/field-types";
import { EMPTY_VALUE, formatDateTime, formatSubmittedField } from "@/lib/requests/format";
import { requestEventLabels } from "@/lib/requests/status";
import type { RequestDetail } from "@/lib/requests/types";
import { getRequestDetail } from "@/server/requests/queries";

export const metadata: Metadata = {
  title: "Detalhe da Solicitação",
};

type RequestPageProps = {
  params: Promise<{ requestId: string }>;
};

export default function RequestPage({ params }: RequestPageProps) {
  return (
    <>
      <PageHeader
        title="Detalhe da Solicitação"
        breadcrumbs={[{ label: "Minhas Solicitações", href: "/requests" }, { label: "Detalhe" }]}
      />
      <div className="p-4 md:p-8">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <RequestContent params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function RequestContent({ params }: RequestPageProps) {
  const { requestId } = await params;
  // RLS returns nothing for requests the viewer may not read: same 404 as a missing id.
  const request = await getRequestDetail(requestId);
  if (!request) notFound();

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <SummaryCard request={request} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileText aria-hidden className="size-5" />
              Dados informados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              {request.values.map((value) => (
                <div
                  key={value.fieldKey}
                  className={value.fieldType === "textarea" || value.fieldType === "multiselect" ? "sm:col-span-full" : undefined}
                >
                  <dt className="text-xs font-medium text-muted-foreground">{value.label}</dt>
                  <dd className="mt-0.5 text-sm break-words whitespace-pre-wrap">{formatSubmittedField(value)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <History aria-hidden className="size-5" />
              Histórico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-4 border-l pl-4">
              {request.events.map((event) => (
                <li key={event.id} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-brand" />
                  <p className="text-sm font-medium">{requestEventLabels[event.eventType]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                    {event.actorName ? ` · ${event.actorName}` : null}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {request.status === "closed" ? (
          <Card>
            <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              Esta solicitação foi concluída e não pode ser reaberta. Se precisar de um novo ajuste, abra uma nova
              solicitação.
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

function SummaryCard({ request }: { request: RequestDetail }) {
  const items = [
    { label: "Departamento", value: request.departmentName },
    { label: "Solicitante", value: request.requesterName ?? request.requesterEmail ?? EMPTY_VALUE },
    { label: "Empresa", value: request.companyName ?? EMPTY_VALUE },
    { label: "Código da empresa", value: request.companyCode ?? EMPTY_VALUE },
    { label: "Abertura", value: formatDateTime(request.openedAt) },
    { label: "Conclusão", value: request.completedAt ? formatDateTime(request.completedAt) : EMPTY_VALUE },
  ];

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-sm font-semibold text-muted-foreground">{request.requestNumber}</p>
            <h2 className="text-xl font-semibold">
              {request.serviceName}
              {request.serviceKind === "correction" ? (
                <Badge variant="outline" className="ml-2 align-middle">
                  {serviceKindLabels.correction}
                </Badge>
              ) : null}
            </h2>
          </div>
          <RequestStatusBadge status={request.status} />
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 text-sm">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
