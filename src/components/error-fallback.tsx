"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

type ErrorFallbackProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/** Shared UI for route error boundaries. Never shows the raw error message. */
export function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-status-danger-soft text-status-danger">
        <TriangleAlert aria-hidden className="size-7" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Não foi possível carregar esta página. Tente novamente; se o problema continuar, informe o
          código abaixo à equipe de Desenvolvimento.
        </p>
      </div>
      {error.digest ? (
        <code className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{error.digest}</code>
      ) : null}
      <Button onClick={() => retry()}>
        <RotateCcw aria-hidden />
        Tentar novamente
      </Button>
    </div>
  );
}
