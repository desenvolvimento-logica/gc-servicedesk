import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type PaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  /** URL of a given page (keeps the current filters). */
  hrefFor: (page: number) => string;
};

export function Pagination({ page, pageCount, total, hrefFor }: PaginationProps) {
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {total} {total === 1 ? "solicitação" : "solicitações"} · página {page} de {pageCount}
      </span>
      <div className="flex gap-2">
        <PageLink href={page > 1 ? hrefFor(page - 1) : null}>
          <ChevronLeft aria-hidden />
          Anterior
        </PageLink>
        <PageLink href={page < pageCount ? hrefFor(page + 1) : null}>
          Próxima
          <ChevronRight aria-hidden />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
