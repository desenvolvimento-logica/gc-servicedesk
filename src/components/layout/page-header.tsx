import { House } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type BreadcrumbEntry = {
  label: string;
  /** Omit for the current page. */
  href?: string;
};

type PageHeaderProps = {
  title: string;
  breadcrumbs?: readonly BreadcrumbEntry[];
  /** Right-hand area (page actions; the user menu joins it in Phase 2). */
  actions?: ReactNode;
};

export function PageHeader({ title, breadcrumbs = [], actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-4 py-5 md:h-(--app-header-height) md:px-8 md:py-0">
      <div className="flex items-start gap-3">
        <SidebarTrigger className="mt-1 text-muted-foreground" aria-label="Recolher ou expandir o menu" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/" className="flex items-center gap-1.5">
                    <House aria-hidden className="size-3.5" />
                    Início
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {breadcrumbs.map((entry) => (
                <Fragment key={entry.label}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {entry.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={entry.href}>{entry.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  );
}
