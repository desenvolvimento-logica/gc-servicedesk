import { House, LogOut, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/server/auth/actions";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Acesso não autorizado",
};

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl border bg-card p-8 text-center shadow-sm md:p-10">
        <BrandLogo tone="on-page" className="w-40" />
        <span className="flex size-14 items-center justify-center rounded-full bg-status-danger-soft text-status-danger">
          <ShieldAlert aria-hidden className="size-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Acesso não autorizado</h1>
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <AccessDeniedDetails />
        </Suspense>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="lg">
            <LogOut aria-hidden />
            Sair e entrar com outra conta
          </Button>
        </form>
      </section>
    </main>
  );
}

async function AccessDeniedDetails() {
  const session = await getSession();

  if (session.status === "unauthenticated") redirect("/login");

  const message =
    session.status === "unlinked"
      ? "Sua conta Microsoft não está vinculada ao cadastro de colaboradores do escritório."
      : "Você não tem permissão para acessar esta área do GC Service Desk.";

  return (
    <div className="space-y-2 text-muted-foreground">
      <p>{message}</p>
      {session.status === "authorized" ? null : (
        <p>
          Se você precisa de acesso, procure o administrador do sistema (equipe de Desenvolvimento) informando o
          e-mail da sua conta corporativa.
        </p>
      )}
      {session.status === "authorized" ? (
        <Button asChild className="mt-2">
          <Link href="/">
            <House aria-hidden />
            Voltar ao início
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
