import { ArrowLeft, FileText, History, Lock, MessageSquareText, RotateCcw, Zap } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { RequestActions } from "@/components/requests/request-actions";
import { RequestComments } from "@/components/requests/request-comments";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { RequestTimeline } from "@/components/requests/request-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { serviceKindLabels } from "@/lib/catalog/field-types";
import { EMPTY_VALUE, formatDateTime, formatSubmittedField } from "@/lib/requests/format";
import type { LinkedRequest, RequestDetail } from "@/lib/requests/types";
import { isLocked } from "@/lib/requests/workflow";
import { requireViewer } from "@/server/auth/session";
import type { Viewer } from "@/server/auth/viewer";
import { getRequestDetail } from "@/server/requests/queries";
import { listOperators } from "@/server/requests/queue-queries";

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
        breadcrumbs={[{ label: "Solicitações", href: "/requests" }, { label: "Detalhe" }]}
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
  const viewer = await requireViewer();
  // RLS returns nothing for requests the viewer may not read: same 404 as a missing id.
  const request = await getRequestDetail(requestId);
  if (!request) notFound();

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {viewer.isStaff ? (
          <Button asChild variant="ghost" size="sm" className="self-start">
            <Link href="/queue">
              <ArrowLeft aria-hidden />
              Fila de Atendimento
            </Link>
          </Button>
        ) : null}
        <SummaryCard request={request} showOperator={viewer.isStaff} />
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquareText aria-hidden className="size-5" />
              Observações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RequestComments
              requestId={request.id}
              comments={request.events.filter(
                (event) => event.eventType === "comment_added" || event.eventType === "internal_note_added",
              )}
              locked={isLocked(request.status)}
            />
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-6">
        {viewer.isStaff ? <StaffPanels viewer={viewer} request={request} /> : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <History aria-hidden className="size-5" />
              Histórico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RequestTimeline events={request.events} />
          </CardContent>
        </Card>

        {request.corrections.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <RotateCcw aria-hidden className="size-5" />
                Correções desta solicitação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {request.corrections.map((correction) => (
                  <li key={correction.id} className="flex items-center justify-between gap-3">
                    <RequestLink request={correction} />
                    <RequestStatusBadge status={correction.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {isLocked(request.status) ? (
          <Card>
            <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
              <p className="flex items-start gap-3">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                Esta solicitação foi concluída e não pode ser reaberta. Se algo precisar ser corrigido ou refeito, abra
                uma solicitação de correção vinculada a ela.
              </p>
              {viewer.requestDepartments.some((department) => department.id === request.dptoId) ? (
                <Button asChild variant="outline">
                  <Link href={`/requests/new?original=${request.id}`}>
                    <RotateCcw aria-hidden />
                    Solicitar correção
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

async function StaffPanels({ viewer, request }: { viewer: Viewer; request: RequestDetail }) {
  const locked = isLocked(request.status);
  const operators = locked ? [] : await listOperators();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Zap aria-hidden className="size-5 text-brand-ink" />
            Ações da equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {locked ? (
            <p className="text-sm text-muted-foreground">
              Concluída por {request.closedByName ?? EMPTY_VALUE}
              {request.completedAt ? ` em ${formatDateTime(request.completedAt)}` : null}. Nenhuma alteração é permitida.
            </p>
          ) : (
            <RequestActions
              requestId={request.id}
              requestNumber={request.requestNumber}
              status={request.status}
              assignedTo={request.assignedTo}
              assignedToName={request.assignedToName}
              operators={operators}
              viewerUserId={viewer.userId}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RequestLink({ request }: { request: LinkedRequest }) {
  return (
    <Link href={`/requests/${request.id}`} className="flex flex-col text-sm hover:underline">
      <span className="font-mono font-semibold text-status-info">{request.requestNumber}</span>
      <span className="text-xs text-muted-foreground">{request.serviceName}</span>
    </Link>
  );
}

function SummaryCard({ request, showOperator }: { request: RequestDetail; showOperator: boolean }) {
  const items: { label: string; value: ReactNode }[] = [
    { label: "Departamento", value: request.departmentName },
    { label: "Solicitante", value: request.requesterName ?? request.requesterEmail ?? EMPTY_VALUE },
    { label: "Empresa", value: request.companyName ?? EMPTY_VALUE },
    { label: "Código da empresa", value: request.companyCode ?? EMPTY_VALUE },
    { label: "Responsável", value: request.assignedToName ?? "Não atribuído" },
    { label: "Abertura", value: formatDateTime(request.openedAt) },
    { label: "Conclusão", value: request.completedAt ? formatDateTime(request.completedAt) : EMPTY_VALUE },
  ];
  if (request.originalRequest) {
    items.push({ label: "Solicitação original", value: <RequestLink request={request.originalRequest} /> });
    if (showOperator) items.push({ label: "Operador da original", value: request.originalOperatorName ?? EMPTY_VALUE });
  }

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
