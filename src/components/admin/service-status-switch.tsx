"use client";

import { setServiceActive } from "@/server/catalog/actions";

import { ActionSwitch } from "./action-switch";

export function ServiceStatusSwitch({ serviceId, active }: { serviceId: string; active: boolean }) {
  return (
    <ActionSwitch
      checked={active}
      label="Serviço ativo"
      onToggle={(next) => setServiceActive(serviceId, next)}
      successMessage={(next) => (next ? "Serviço ativado." : "Serviço desativado: não aparece mais para os solicitantes.")}
    />
  );
}
