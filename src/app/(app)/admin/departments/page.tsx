import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { DepartmentsTable } from "@/components/admin/departments-table";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdminDepartments } from "@/server/catalog/queries";

export const metadata: Metadata = {
  title: "Departamentos",
};

export default function AdminDepartmentsPage() {
  return (
    <>
      <PageHeader title="Departamentos" breadcrumbs={[{ label: "Administração" }, { label: "Departamentos" }]} />
      <div className="p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Building2 aria-hidden className="size-5" />
              Departamentos solicitantes
            </CardTitle>
            <CardDescription>
              Os departamentos vêm do cadastro corporativo. Membros de um departamento habilitado podem abrir
              solicitações para os serviços dele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              <DepartmentsContent />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function DepartmentsContent() {
  return <DepartmentsTable departments={await listAdminDepartments()} />;
}
