import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FieldFormDialog } from "@/components/admin/field-form-dialog";
import { FieldsTable } from "@/components/admin/fields-table";
import { ServiceFormDialog } from "@/components/admin/service-form-dialog";
import { ServiceStatusSwitch } from "@/components/admin/service-status-switch";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { serviceKindLabels } from "@/lib/catalog/field-types";
import { getAdminService } from "@/server/catalog/queries";

export const metadata: Metadata = {
  title: "Configuração do serviço",
};

export default function AdminServicePage({ params }: PageProps<"/admin/services/[serviceId]">) {
  return (
    <>
      <PageHeader
        title="Configuração do serviço"
        breadcrumbs={[{ label: "Administração" }, { label: "Serviços", href: "/admin/services" }, { label: "Configuração" }]}
      />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <Suspense fallback={<Skeleton className="h-128 rounded-xl" />}>
          <ServiceDetails params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function ServiceDetails({ params }: Pick<PageProps<"/admin/services/[serviceId]">, "params">) {
  const { serviceId } = await params;
  const service = await getAdminService(serviceId);
  if (!service) notFound();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl font-semibold">
              {service.name}
              {service.kind === "correction" ? <Badge variant="outline">{serviceKindLabels.correction}</Badge> : null}
            </CardTitle>
            <CardDescription>{service.departmentName}</CardDescription>
          </div>
          <ServiceFormDialog mode="edit" service={service} />
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-8">
          <div>
            <p className="text-muted-foreground">Descrição</p>
            <p>{service.description ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Ordem</p>
            <p className="tabular-nums">{service.sortOrder}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground">Ativo</p>
            <ServiceStatusSwitch serviceId={service.id} active={service.active} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ListChecks aria-hidden className="size-5" />
              Campos do formulário
            </CardTitle>
            <CardDescription>
              Campos exibidos no formulário de solicitação deste serviço, na ordem abaixo. Campos inativos não
              aparecem para o solicitante.
            </CardDescription>
          </div>
          <FieldFormDialog mode="create" serviceId={service.id} />
        </CardHeader>
        <CardContent>
          <FieldsTable fields={service.fields} />
        </CardContent>
      </Card>
    </>
  );
}
