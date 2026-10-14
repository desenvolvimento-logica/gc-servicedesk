import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { RequestsTable } from "@/components/requests/requests-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireViewer } from "@/server/auth/session";
import { canOpenRequests } from "@/server/auth/viewer";
import { listMyRequests } from "@/server/requests/queries";

export const metadata: Metadata = {
  title: "Minhas Solicitações",
};

type MyRequestsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default function MyRequestsPage({ searchParams }: MyRequestsPageProps) {
  return (
    <>
      <PageHeader title="Minhas Solicitações" breadcrumbs={[{ label: "Minhas Solicitações" }]} />
      <div className="p-4 md:p-8">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FileText aria-hidden className="size-5" />
              Solicitações abertas por você
            </CardTitle>
            <Suspense fallback={null}>
              <NewRequestButton />
            </Suspense>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
              <RequestsList searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function NewRequestButton() {
  const viewer = await requireViewer();
  if (!canOpenRequests(viewer)) return null;

  return (
    <Button asChild>
      <Link href="/requests/new">
        <Plus aria-hidden />
        Nova solicitação
      </Link>
    </Button>
  );
}

async function RequestsList({ searchParams }: Pick<MyRequestsPageProps, "searchParams">) {
  const { page: rawPage } = await searchParams;
  const requested = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const result = await listMyRequests(Number.isInteger(requested) && requested > 0 ? requested : 1);

  if (result.total === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhuma solicitação ainda"
        description="Quando você abrir uma solicitação, ela aparecerá aqui com o status e a última atualização."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RequestsTable requests={result.items} />
      <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {result.total} {result.total === 1 ? "solicitação" : "solicitações"} · página {result.page} de {result.pageCount}
        </span>
        <div className="flex gap-2">
          <PageLink page={result.page - 1} disabled={result.page <= 1} label="Anterior" icon="previous" />
          <PageLink page={result.page + 1} disabled={result.page >= result.pageCount} label="Próxima" icon="next" />
        </div>
      </nav>
    </div>
  );
}

function PageLink({ page, disabled, label, icon }: { page: number; disabled: boolean; label: string; icon: "previous" | "next" }) {
  const content = (
    <>
      {icon === "previous" ? <ChevronLeft aria-hidden /> : null}
      {label}
      {icon === "next" ? <ChevronRight aria-hidden /> : null}
    </>
  );

  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {content}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/requests?page=${page}`}>{content}</Link>
    </Button>
  );
}
