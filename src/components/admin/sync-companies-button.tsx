"use client";

import { DatabaseBackup, RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { syncCompaniesNow } from "@/server/companies/actions";

export function SyncCompaniesButton() {
  const [pending, startTransition] = useTransition();

  /** `full` lists every company again instead of only the changed ones. */
  const sync = (full: boolean) =>
    startTransition(async () => {
      const result = await syncCompaniesNow(full);
      if (result.ok) {
        toast.success(
          result.data.upserted === 0
            ? "Sincronização concluída: nenhuma empresa alterada."
            : `Sincronização concluída: ${result.data.upserted} empresa(s) atualizada(s).`,
        );
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => sync(true)}
        disabled={pending}
        title="Busca todas as empresas novamente (leva alguns minutos)"
      >
        <DatabaseBackup aria-hidden />
        Sincronização completa
      </Button>
      <Button onClick={() => sync(false)} disabled={pending}>
        <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} />
        {pending ? "Sincronizando..." : "Sincronizar agora"}
      </Button>
    </div>
  );
}
