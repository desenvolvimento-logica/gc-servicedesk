"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EMPTY_VALUE, formatDateTime } from "@/lib/requests/format";
import { SEARCH_MAX_LENGTH } from "@/lib/requests/queue-filters";
import type { CorrectableRequest } from "@/lib/requests/types";
import { cn } from "@/lib/utils";
import { searchCorrectableRequests } from "@/server/requests/actions";

type OriginalRequestPickerProps = {
  serviceId: string;
  value: CorrectableRequest | null;
  onChange: (value: CorrectableRequest | null) => void;
  error?: string;
  disabled?: boolean;
};

const SEARCH_DELAY_MS = 300;

/**
 * Picks the closed request a correction refers to: a list of the most
 * recent eligible requests, filtered as the user types (protocol, company,
 * code or service). The server decides what is eligible.
 */
export function OriginalRequestPicker({ serviceId, value, onChange, error, disabled }: OriginalRequestPickerProps) {
  const id = useId();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CorrectableRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (value) return;
    const timer = setTimeout(
      () =>
        startTransition(async () => {
          const result = await searchCorrectableRequests(serviceId, term);
          if (result.ok) {
            setResults(result.data);
            setLoadError(null);
          } else {
            setLoadError(result.message);
          }
        }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [serviceId, term, value]);

  const messageId = `${id}-message`;

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>
          Solicitação original
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-brand-soft/50 p-3">
          <CorrectableSummary request={value} />
          {disabled ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              Trocar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        Solicitação original
        <span aria-hidden className="text-destructive">
          *
        </span>
      </Label>
      <div className="relative">
        <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={term}
          maxLength={SEARCH_MAX_LENGTH}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Digite o protocolo, a empresa ou o serviço"
          className="pl-9"
          aria-invalid={!!error}
          aria-describedby={messageId}
          aria-controls={`${id}-results`}
          disabled={disabled}
        />
      </div>

      <div id={`${id}-results`} aria-live="polite" aria-busy={pending} className="flex flex-col gap-2">
        {results === null ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : results.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {term.trim()
              ? "Nenhuma solicitação concluída encontrada para essa busca."
              : "Não há solicitações concluídas deste departamento para corrigir."}
          </p>
        ) : (
          <ul className={cn("flex max-h-72 flex-col gap-2 overflow-y-auto", pending && "opacity-60")}>
            {results.map((request) => (
              <li key={request.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(request)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <CorrectableSummary request={request} />
                  <Check aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ?? loadError ? (
        <p id={messageId} role="alert" className="text-xs text-destructive">
          {error ?? loadError}
        </p>
      ) : (
        <p id={messageId} className="text-xs text-muted-foreground">
          Somente solicitações concluídas deste departamento. Mostrando as mais recentes.
        </p>
      )}
    </div>
  );
}

function CorrectableSummary({ request }: { request: CorrectableRequest }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-mono text-sm font-semibold">{request.requestNumber}</span>
      <span className="text-sm">{request.serviceName}</span>
      <span className="text-xs text-muted-foreground">
        {request.companyName ?? EMPTY_VALUE}
        {request.companyCode ? ` (${request.companyCode})` : null} · concluída em {formatDateTime(request.completedAt)}
      </span>
    </span>
  );
}
