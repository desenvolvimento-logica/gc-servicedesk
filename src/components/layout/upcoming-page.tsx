import { Construction } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

import { PageHeader, type BreadcrumbEntry } from "./page-header";

type UpcomingPageProps = {
  title: string;
  breadcrumbs: readonly BreadcrumbEntry[];
};

/** Placeholder for a screen whose module has not been implemented yet. */
export function UpcomingPage({ title, breadcrumbs }: UpcomingPageProps) {
  return (
    <>
      <PageHeader title={title} breadcrumbs={breadcrumbs} />
      <div className="p-4 md:p-8">
        <EmptyState
          icon={Construction}
          title="Em construção"
          description="Esta área será disponibilizada em uma próxima etapa do GC Service Desk."
          className="bg-card"
        />
      </div>
    </>
  );
}
