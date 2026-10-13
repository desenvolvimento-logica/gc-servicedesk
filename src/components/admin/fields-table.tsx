"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fieldTypeLabels, isSupportedFieldType } from "@/lib/catalog/field-types";
import type { AdminServiceField } from "@/lib/catalog/types";
import { moveField, setFieldActive } from "@/server/catalog/actions";

import { ActionSwitch } from "./action-switch";
import { FieldFormDialog } from "./field-form-dialog";

type FieldsTableProps = {
  fields: readonly AdminServiceField[];
};

export function FieldsTable({ fields }: FieldsTableProps) {
  const [moving, startMove] = useTransition();

  const move = (field: AdminServiceField, direction: "up" | "down") =>
    startMove(async () => {
      const result = await moveField(field.id, direction);
      if (!result.ok) toast.error(result.message);
    });

  if (fields.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Este serviço ainda não tem campos.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Ordem</TableHead>
          <TableHead>Rótulo do campo</TableHead>
          <TableHead>Chave (key)</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Obrigatório</TableHead>
          <TableHead>Ativo</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((field, index) => (
          <TableRow key={field.id} className={field.active ? undefined : "text-muted-foreground"}>
            <TableCell>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={moving || index === 0}
                  aria-label={`Mover ${field.label} para cima`}
                  onClick={() => move(field, "up")}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={moving || index === fields.length - 1}
                  aria-label={`Mover ${field.label} para baixo`}
                  onClick={() => move(field, "down")}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </div>
            </TableCell>
            <TableCell className="font-medium">
              {field.label}
              {field.helpText ? <p className="text-xs font-normal text-muted-foreground">{field.helpText}</p> : null}
            </TableCell>
            <TableCell className="font-mono text-xs">{field.fieldKey}</TableCell>
            <TableCell>
              <Badge variant="secondary">{fieldTypeLabels[field.fieldType]}</Badge>
            </TableCell>
            <TableCell>{field.required ? "Sim" : "Não"}</TableCell>
            <TableCell>
              <ActionSwitch
                checked={field.active}
                label={`Campo ${field.label} ativo`}
                disabled={!field.active && !isSupportedFieldType(field.fieldType)}
                onToggle={(active) => setFieldActive(field.id, active)}
                successMessage={(active) => (active ? "Campo ativado." : "Campo desativado.")}
              />
            </TableCell>
            <TableCell>
              <FieldFormDialog mode="edit" field={field} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
