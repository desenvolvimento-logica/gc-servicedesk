import { FileQuestion, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { NewRequestWizard } from "@/components/requests/new-request-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listRequestableDepartments } from "@/server/requests/queries";

export const metadata: Metadata = {
  title: "Nova Solicitação",
};

const rules = [
  {
    title: "Uma solicitação = um serviço",
    text: "Cada solicitação deve tratar de apenas um serviço. Caso precise de mais de um serviço, abra uma nova solicitação para cada um deles.",
  },
  {
    title: "Solicitações não podem ser reabertas",
    text: "Após a conclusão, a solicitação é encerrada e não poderá ser reaberta. Se for necessário um novo ajuste, abra uma nova solicitação.",
  },
  {
    title: "Informações completas",
    text: "Preencha todos os campos com atenção para que sua solicitação seja atendida com mais agilidade.",
  },
] as const;

export default function NewRequestPage() {
  return (
    <>
      <PageHeader title="Nova Solicitação" breadcrumbs={[{ label: "Solicitações", href: "/requests" }, { label: "Nova Solicitação" }]} />
      <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
            <RequestWizard />
          </Suspense>
        </div>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <TriangleAlert aria-hidden className="size-5 text-brand-ink" />
                Regras importantes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {rules.map((rule, index) => (
                  <li key={rule.title} className="flex gap-3 rounded-lg bg-brand-soft p-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                      {index + 1}
                    </span>
                    <div className="space-y-1">
                      <p className="font-semibold">{rule.title}</p>
                      <p className="text-sm leading-relaxed text-muted-foreground">{rule.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

async function RequestWizard() {
  // Redirects users who may not open requests.
  const departments = await listRequestableDepartments();

  if (departments.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Nenhum serviço disponível"
        description="Ainda não há serviços ativos para o seu departamento. Procure a Gestão de Cadastro."
        className="bg-card"
      />
    );
  }

  return <NewRequestWizard departments={departments} />;
}
