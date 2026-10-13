import { Lightbulb, Settings } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ServiceFormDialog } from "@/components/admin/service-form-dialog";
import { ServicesTable } from "@/components/admin/services-table";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdminDepartments, listAdminServices } from "@/server/catalog/queries";

export const metadata: Metadata = {
  title: "Administração de Serviços",
};

export default function AdminServicesPage() {
  return (
    <>
      <PageHeader title="Administração de Serviços" breadcrumbs={[{ label: "Administração" }, { label: "Serviços" }]} />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <Card>
          <CardContent className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft">
              <Lightbulb aria-hidden className="size-6 text-brand-ink" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold">Formulários dinâmicos</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Os administradores definem os serviços e seus campos, e o sistema gera automaticamente o formulário
                de solicitação, sem necessidade de desenvolvimento. Serviços e campos não são excluídos: desative-os
                para que deixem de aparecer, preservando o histórico.
              </p>
            </div>
          </CardContent>
        </Card>

        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <ServicesCard />
        </Suspense>
      </div>
    </>
  );
}

async function ServicesCard() {
  const [services, departments] = await Promise.all([listAdminServices(), listAdminDepartments()]);
  const requesterDepartments = departments
    .filter((department) => department.isRequesterDepartment)
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
  const activeRequesterDepartments = requesterDepartments.filter((department) => department.active);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Settings aria-hidden className="size-5" />
          Serviços cadastrados
        </CardTitle>
        {activeRequesterDepartments.length > 0 ? (
          <ServiceFormDialog mode="create" departments={activeRequesterDepartments} />
        ) : null}
      </CardHeader>
      <CardContent>
        <ServicesTable services={services} departments={requesterDepartments} />
      </CardContent>
    </Card>
  );
}
