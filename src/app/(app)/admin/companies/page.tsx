import { BriefcaseBusiness, History, Search } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { SyncCompaniesButton } from "@/components/admin/sync-companies-button";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDocument } from "@/lib/companies/normalize";
import { COMPANY_SEARCH_MAX_LENGTH, type CompanySyncRun } from "@/lib/companies/types";
import { formatDateTime } from "@/lib/requests/format";
import { listCompaniesForAdmin, listCompanySyncRuns } from "@/server/companies/queries";

export const metadata: Metadata = {
  title: "Empresas",
};

/** The manual sync runs inside this page's server action. */
export const maxDuration = 300;

type CompaniesPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default function AdminCompaniesPage({ searchParams }: CompaniesPageProps) {
  return (
    <>
      <PageHeader title="Empresas" breadcrumbs={[{ label: "Administração" }, { label: "Empresas" }]} />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <History aria-hidden className="size-5" />
                Sincronização com o Acessórias
              </CardTitle>
              <CardDescription>
                As empresas são copiadas do Acessórias todos os dias às 6h; use o botão para atualizar na hora. O
                &ldquo;Código da empresa&rdquo; nas solicitações é o ID da empresa no Acessórias.
              </CardDescription>
            </div>
            <SyncCompaniesButton />
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-32 rounded-xl" />}>
              <SyncHistory />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <BriefcaseBusiness aria-hidden className="size-5" />
              Empresas sincronizadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              <CompaniesList searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const runStatus: Record<CompanySyncRun["status"], { label: string; tone: StatusTone }> = {
  running: { label: "Em andamento", tone: "warning" },
  success: { label: "Concluída", tone: "success" },
  error: { label: "Erro", tone: "danger" },
};

async function SyncHistory() {
  const runs = await listCompanySyncRuns();
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma sincronização ainda.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Início</TableHead>
          <TableHead>Origem</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead className="text-right">Empresas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="tabular-nums">{formatDateTime(run.startedAt)}</TableCell>
            <TableCell>{run.trigger === "cron" ? "Automática" : `Manual · ${run.actorName ?? "—"}`}</TableCell>
            <TableCell>{run.mode === "full" ? "Completa" : "Alterações"}</TableCell>
            <TableCell>
              <StatusBadge label={runStatus[run.status].label} tone={runStatus[run.status].tone} />
              {run.error ? <span className="mt-1 block max-w-md text-xs text-destructive">{run.error}</span> : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">{run.upserted}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

async function CompaniesList({ searchParams }: CompaniesPageProps) {
  const { q } = await searchParams;
  const term = (Array.isArray(q) ? q[0] : q) ?? "";
  const page = await listCompaniesForAdmin(term);

  return (
    <div className="flex flex-col gap-4">
      {/* Plain GET form: the search lives in the URL. */}
      <form className="relative sm:max-w-md" action="/admin/companies">
        <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={term}
          maxLength={COMPANY_SEARCH_MAX_LENGTH}
          placeholder="Nome, fantasia, CNPJ ou código"
          aria-label="Buscar empresa"
          className="pl-9"
        />
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>CNPJ/CPF</TableHead>
            <TableHead>UF</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((company) => (
            <TableRow key={company.id}>
              <TableCell className="font-mono tabular-nums">{company.id}</TableCell>
              <TableCell>
                <span className="block font-medium">{company.legalName}</span>
                {company.tradeName ? <span className="text-xs text-muted-foreground">{company.tradeName}</span> : null}
              </TableCell>
              <TableCell className="tabular-nums">{formatDocument(company.document)}</TableCell>
              <TableCell>{company.uf ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge label={company.active ? "Ativa" : "Inativa"} tone={company.active ? "success" : "neutral"} />
              </TableCell>
            </TableRow>
          ))}
          {page.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {page.total === 0 ? "Nenhuma empresa sincronizada ainda." : "Nenhuma empresa encontrada."}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {page.total} empresas sincronizadas ({page.active} ativas). Mostrando até 50 resultados.
      </p>
    </div>
  );
}
