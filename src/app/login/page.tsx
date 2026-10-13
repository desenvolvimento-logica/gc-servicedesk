import { BarChart3, ChevronRight, CircleCheck, FileText, Lock, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

import { BrandLogo } from "@/components/brand/brand-logo";
import { MicrosoftLogo } from "@/components/brand/microsoft-logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Acesso",
};

type Highlight = {
  icon: LucideIcon;
  title: string;
  description: string;
  iconClassName: string;
};

const highlights: readonly Highlight[] = [
  {
    icon: FileText,
    title: "Solicitações centralizadas",
    description: "Abra e acompanhe solicitações de forma simples e organizada.",
    iconClassName: "bg-brand-soft text-status-warning",
  },
  {
    icon: Settings,
    title: "Acompanhamento do andamento",
    description: "Veja o status e os responsáveis de cada solicitação.",
    iconClassName: "bg-brand-soft text-status-warning",
  },
  {
    icon: CircleCheck,
    title: "Histórico completo",
    description: "Consulte todas as interações e mantenha a rastreabilidade.",
    iconClassName: "bg-status-success-soft text-status-success",
  },
  {
    icon: BarChart3,
    title: "Operações internas mais eficientes",
    description: "Integra pessoas, processos e informações para um ecossistema contábil mais simples.",
    iconClassName: "bg-brand-soft text-status-warning",
  },
];

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-10 md:px-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
        <section className="hidden flex-col gap-10 lg:flex">
          <div className="flex items-center gap-6">
            <BrandLogo tone="on-light" className="w-44" priority />
            <span aria-hidden className="h-12 w-px bg-border" />
            <div>
              <p className="text-xl font-bold">GC Service Desk</p>
              <p className="text-muted-foreground">Gestão de Cadastro</p>
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl leading-tight font-bold tracking-tight xl:text-5xl">
              Agilidade e controle
              <br />
              para a Gestão de <span className="text-brand">Cadastro</span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Centralize solicitações, acompanhe o andamento, consulte o histórico e mantenha os
              cadastros da empresa sempre atualizados.
            </p>
          </div>

          <ul className="grid max-w-xl gap-6">
            {highlights.map((item) => (
              <li key={item.title} className="flex items-start gap-4">
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${item.iconClassName}`}
                >
                  <item.icon aria-hidden className="size-6" />
                </span>
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="login-title"
          className="flex flex-col gap-8 rounded-2xl border bg-card p-8 shadow-sm md:p-10"
        >
          <div className="flex flex-col items-center gap-3 border-b pb-8 text-center">
            <BrandLogo tone="on-light" className="w-48" />
            <div>
              <p className="text-2xl font-bold">
                GC Service <span className="text-brand">Desk</span>
              </p>
              <p className="text-muted-foreground">Gestão de Cadastro</p>
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h2 id="login-title" className="text-2xl font-bold tracking-tight">
              Acesse com sua conta corporativa
            </h2>
            <p className="text-muted-foreground">
              O acesso ao GC Service Desk é realizado por meio do Microsoft SSO (conta corporativa da
              empresa).
            </p>
          </div>

          <div className="space-y-2">
            {/* Enabled in Phase 2, once Microsoft Entra ID SSO is wired to Supabase Auth. */}
            <Button size="lg" className="h-14 w-full justify-between px-5 text-base font-semibold" disabled>
              <MicrosoftLogo className="size-6" />
              Entrar com Microsoft
              <ChevronRight aria-hidden />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              O login será habilitado em breve.
            </p>
          </div>

          <div className="flex items-start gap-4 rounded-xl bg-status-info-soft p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-status-info">
              <Lock aria-hidden className="size-5" />
            </span>
            <div>
              <p className="font-semibold">Acesso restrito</p>
              <p className="text-sm text-muted-foreground">
                Apenas usuários autorizados da Lógica Assessoria Contábil podem acessar este sistema.
                Utilize sua conta corporativa Microsoft.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
