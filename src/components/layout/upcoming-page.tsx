import { Construction } from "lucide-react";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

import { PageHeader, type BreadcrumbEntry } from "./page-header";

type UpcomingPageProps = {
  title: string;
  breadcrumbs: readonly BreadcrumbEntry[];
  /** Server-side permission check; it runs before any content is rendered. */
  authorize: () => Promise<unknown>;
};

/** Placeholder for a screen whose module has not been implemented yet. */
export function UpcomingPage({ title, breadcrumbs, authorize }: UpcomingPageProps) {
  return (
    <>
      <PageHeader title={title} breadcrumbs={breadcrumbs} />
      <div className="p-4 md:p-8">
        <Suspense fallback={<Skeleton className="h-56 rounded-xl" />}>
          <UpcomingContent authorize={authorize} />
        </Suspense>
      </div>
    </>
  );
}

async function UpcomingContent({ authorize }: Pick<UpcomingPageProps, "authorize">) {
  await authorize();

  return (
    <EmptyState
      icon={Construction}
      title="Em construção"
      description="Esta área será disponibilizada em uma próxima etapa do GC Service Desk."
      className="bg-card"
    />
  );
}
