import { FileQuestion, House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página não encontrada",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <FileQuestion aria-hidden className="size-7" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>
      <Button asChild>
        <Link href="/">
          <House aria-hidden />
          Voltar ao início
        </Link>
      </Button>
    </main>
  );
}
