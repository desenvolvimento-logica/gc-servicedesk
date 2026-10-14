"use client";

import { Building, Search } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDocument } from "@/lib/companies/normalize";
import { COMPANY_SEARCH_MAX_LENGTH, type Company } from "@/lib/companies/types";
import { cn } from "@/lib/utils";
import { searchCompanies } from "@/server/companies/actions";

type CompanyPickerProps = {
  onSelect: (company: Company) => void;
  disabled?: boolean;
};

const SEARCH_DELAY_MS = 300;
const MIN_TERM_LENGTH = 2;

/**
 * Searches the companies synchronized from Acessórias (active only) and hands
 * the chosen one to the form, which fills "Nome da empresa" and "Código da
 * empresa". The fields stay editable.
 */
export function CompanyPicker({ onSelect, disabled }: CompanyPickerProps) {
  const id = useId();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searching = term.trim().length >= MIN_TERM_LENGTH;

  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(
      () =>
        startTransition(async () => {
          const result = await searchCompanies(term);
          if (result.ok) {
            setResults(result.data);
            setMessage(result.data.length === 0 ? "Nenhuma empresa ativa encontrada no Acessórias." : null);
          } else {
            setResults([]);
            setMessage(result.message);
          }
        }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [term, searching]);

  const choose = (company: Company) => {
    onSelect(company);
    setTerm("");
    setResults([]);
    setMessage(null);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
      <Label htmlFor={id} className="flex items-center gap-2">
        <Building aria-hidden className="size-4" />
        Buscar empresa no Acessórias
      </Label>
      <div className="relative">
        <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={term}
          maxLength={COMPANY_SEARCH_MAX_LENGTH}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Nome, fantasia, CNPJ ou código"
          className="bg-background pl-9"
          aria-describedby={`${id}-hint`}
          aria-controls={`${id}-results`}
          disabled={disabled}
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Ao escolher, &ldquo;Nome da empresa&rdquo; e &ldquo;Código da empresa&rdquo; são preenchidos automaticamente.
      </p>

      <div id={`${id}-results`} aria-live="polite" aria-busy={pending}>
        {searching && results.length > 0 ? (
          <ul className={cn("flex max-h-64 flex-col gap-1 overflow-y-auto", pending && "opacity-60")}>
            {results.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  onClick={() => choose(company)}
                  className="flex w-full flex-col rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="text-sm font-medium">{company.legalName}</span>
                  <span className="text-xs text-muted-foreground">
                    Código {company.id} · {formatDocument(company.document) || "sem documento"}
                    {company.tradeName ? ` · ${company.tradeName}` : null}
                    {company.uf ? ` · ${company.uf}` : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : searching && message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
