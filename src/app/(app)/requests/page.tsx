import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/requests/pagination";
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
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(page) => `/requests?page=${page}`} />
    </div>
  );
}
