"use client";

import { CircleCheckBig, Play, UserCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/admin/form-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/lib/catalog/types";
import type { RequestStatus } from "@/lib/requests/status";
import type { Operator } from "@/lib/requests/types";
import { nextStatuses } from "@/lib/requests/workflow";
import { assignRequest, changeRequestStatus } from "@/server/requests/workflow-actions";

const NO_ASSIGNEE = "none";

type RequestActionsProps = {
  requestId: string;
  requestNumber: string;
  status: RequestStatus;
  assignedTo: number | null;
  assignedToName: string | null;
  operators: readonly Operator[];
  viewerUserId: number;
};

/** Staff controls of an open request: assignment and forward status changes. */
export function RequestActions(props: RequestActionsProps) {
  const { requestId, status, assignedTo, operators, viewerUserId } = props;
  const [pending, startTransition] = useTransition();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const next = nextStatuses(status);
  const viewerIsOperator = operators.some((operator) => operator.userId === viewerUserId);

  const run = (action: () => Promise<ActionResult>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.message);
    });

  const assign = (value: string) => {
    const assignee = value === NO_ASSIGNEE ? null : Number(value);
    run(
      () => assignRequest(requestId, assignee),
      assignee === null ? "Responsável removido." : "Responsável atualizado.",
    );
  };

  // The current assignee may have lost the operator role: keep showing them.
  const assigneeMissing = assignedTo !== null && !operators.some((operator) => operator.userId === assignedTo);

  return (
    <div className="flex flex-col gap-5">
      <FormField id="request-assignee" label="Responsável">
        <Select value={assignedTo === null ? NO_ASSIGNEE : String(assignedTo)} onValueChange={assign} disabled={pending}>
          <SelectTrigger id="request-assignee" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
            {assigneeMissing ? (
              <SelectItem value={String(assignedTo)} disabled>
                {props.assignedToName ?? "Responsável atual"} (inativo)
              </SelectItem>
            ) : null}
            {operators.map((operator) => (
              <SelectItem key={operator.userId} value={String(operator.userId)}>
                {operator.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {viewerIsOperator && assignedTo !== viewerUserId ? (
        <Button variant="outline" disabled={pending} onClick={() => assign(String(viewerUserId))}>
          <UserCheck aria-hidden />
          Assumir solicitação
        </Button>
      ) : null}

      {next.includes("in_progress") ? (
        <Button disabled={pending} onClick={() => run(() => changeRequestStatus(requestId, "in_progress"), "Atendimento iniciado.")}>
          <Play aria-hidden />
          Iniciar atendimento
        </Button>
      ) : null}

      {next.includes("closed") ? (
        <>
          <Button variant="outline" className="border-status-success text-status-success" disabled={pending} onClick={() => setConfirmingClose(true)}>
            <CircleCheckBig aria-hidden />
            Concluir solicitação
          </Button>
          <AlertDialog open={confirmingClose} onOpenChange={setConfirmingClose}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir {props.requestNumber}?</AlertDialogTitle>
                <AlertDialogDescription>
                  A solicitação será encerrada e não poderá ser reaberta nem alterada. Se for necessário um novo
                  ajuste, o solicitante deverá abrir uma nova solicitação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => changeRequestStatus(requestId, "closed"), "Solicitação concluída.")}>
                  Concluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}
