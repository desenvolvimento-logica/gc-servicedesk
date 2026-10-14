"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { syncCompaniesNow } from "@/server/companies/actions";

export function SyncCompaniesButton() {
  const [pending, startTransition] = useTransition();

  const sync = () =>
    startTransition(async () => {
      const result = await syncCompaniesNow();
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
    <Button onClick={sync} disabled={pending}>
      <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} />
      {pending ? "Sincronizando..." : "Sincronizar agora"}
    </Button>
  );
}
