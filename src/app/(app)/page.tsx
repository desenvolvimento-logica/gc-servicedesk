import { ChevronRight, FileText, Info, Lightbulb, Plus, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Painel do Solicitante",
};

export default function HomePage() {
  return (
    <>
      <PageHeader title="Painel do Solicitante" breadcrumbs={[{ label: "Painel" }]} />

      <div className="grid gap-6 p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                <Lightbulb aria-hidden className="size-6 text-brand-ink" />
              </span>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold">Resumo rápido</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  O GC Service Desk é o canal oficial para abertura e acompanhamento de solicitações da
                  Gestão de Cadastro. Aqui você solicita serviços, acompanha o andamento e visualiza o
                  histórico de atendimentos de forma simples e centralizada.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <FileText aria-hidden className="size-5" />
                Minhas solicitações recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={FileText}
                title="Suas solicitações aparecerão aqui"
                description="Assim que você abrir uma solicitação, ela será listada nesta área com o status e a última atualização."
              />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Zap aria-hidden className="size-5 text-brand" />
                Ações rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button asChild size="lg" className="h-12 justify-between px-4 text-base">
                <Link href="/requests/new">
                  <span className="flex items-center gap-2">
                    <Plus aria-hidden />
                    Nova solicitação
                  </span>
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 justify-between px-4 text-base">
                <Link href="/requests">
                  <span className="flex items-center gap-2">
                    <FileText aria-hidden />
                    Consultar histórico
                  </span>
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Info aria-hidden className="size-5 text-status-info" />
                Importante saber
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 rounded-lg">
              <p className="font-semibold">Cada solicitação representa apenas um serviço.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Se precisar de mais de um serviço para a mesma empresa, abra uma nova solicitação para
                cada um deles.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
