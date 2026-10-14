import { Check } from "lucide-react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

export type RequestStep = "fill" | "review" | "done";

const steps: readonly { key: RequestStep; title: string; description: string }[] = [
  { key: "fill", title: "Preenchimento", description: "Dados da solicitação" },
  { key: "review", title: "Revisão", description: "Confira as informações" },
  { key: "done", title: "Enviado", description: "Acompanhe o andamento" },
];

export function RequestSteps({ current }: { current: RequestStep }) {
  const currentIndex = steps.findIndex((step) => step.key === current);

  return (
    <ol aria-label="Etapas da solicitação" className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center md:px-8">
      {steps.map((step, index) => {
        const done = index < currentIndex || current === "done";
        const active = index === currentIndex;
        return (
          <Fragment key={step.key}>
            {index > 0 ? <li aria-hidden className={cn("hidden h-px flex-1 sm:block", done || active ? "bg-brand" : "bg-border")} /> : null}
            <li aria-current={active ? "step" : undefined} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  done || active ? "bg-brand text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {done && !active ? <Check aria-hidden className="size-5" /> : index + 1}
              </span>
              <span className="flex flex-col">
                <span className={cn("font-semibold", !active && !done && "text-muted-foreground")}>{step.title}</span>
                <span className="text-xs text-muted-foreground">{step.description}</span>
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
