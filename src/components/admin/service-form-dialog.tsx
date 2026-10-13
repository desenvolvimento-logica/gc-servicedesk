"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_KINDS, serviceKindLabels } from "@/lib/catalog/field-types";
import { createServiceSchema, type CreateServiceInput, type CreateServiceValues } from "@/lib/catalog/schemas";
import type { AdminService } from "@/lib/catalog/types";
import { createService, updateService } from "@/server/catalog/actions";

import { applyServerErrors } from "./apply-server-errors";
import { FormField } from "./form-field";

type ServiceFormDialogProps =
  | { mode: "create"; departments: readonly { id: number; name: string }[] }
  | {
      mode: "edit";
      service: Pick<AdminService, "id" | "name" | "description" | "sortOrder" | "dptoId" | "departmentName" | "kind">;
    };

export function ServiceFormDialog(props: ServiceFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isCreate = props.mode === "create";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isCreate ? (
          <Button>
            <Plus aria-hidden />
            Novo serviço
          </Button>
        ) : (
          <Button variant="outline">
            <Pencil aria-hidden />
            Editar serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Novo serviço" : "Editar serviço"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "O serviço é criado com o campo comum “Observações”. Depois, adicione os campos do formulário."
              : `${props.service.departmentName} · ${serviceKindLabels[props.service.kind]}. Departamento e tipo não podem ser alterados.`}
          </DialogDescription>
        </DialogHeader>
        {/* Remounted on every open so it always starts from the saved values. */}
        {open ? <ServiceForm {...props} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm(props: ServiceFormDialogProps & { onDone: () => void }) {
  const router = useRouter();
  const isCreate = props.mode === "create";

  // One schema for both modes: when editing, department and kind are shown
  // fixed and the server ignores them (they are immutable in the database).
  const form = useForm<CreateServiceInput, unknown, CreateServiceValues>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: isCreate
      ? { name: "", description: "", sortOrder: 0, dptoId: props.departments[0]?.id ?? 0, kind: "standard" }
      : {
          name: props.service.name,
          description: props.service.description ?? "",
          sortOrder: props.service.sortOrder,
          dptoId: props.service.dptoId,
          kind: props.service.kind,
        },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!isCreate) {
      const result = await updateService(props.service.id, {
        name: values.name,
        description: values.description ?? "",
        sortOrder: values.sortOrder,
      });
      if (!result.ok) return applyServerErrors(result, form.setError);
      toast.success("Serviço atualizado.");
      return props.onDone();
    }

    const result = await createService({ ...values, description: values.description ?? "" });
    if (!result.ok) return applyServerErrors(result, form.setError);
    toast.success("Serviço criado.");
    props.onDone();
    router.push(`/admin/services/${result.data.id}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {isCreate ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="service-department" label="Departamento solicitante" error={errors.dptoId?.message}>
            <Controller
              control={form.control}
              name="dptoId"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <SelectTrigger id="service-department" className="w-full" aria-describedby="service-department-message">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.departments.map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="service-kind" label="Tipo" error={errors.kind?.message}>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="service-kind" className="w-full" aria-describedby="service-kind-message">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {serviceKindLabels[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>
      ) : null}

      <FormField id="service-name" label="Nome do serviço" error={errors.name?.message}>
        <Input id="service-name" aria-invalid={!!errors.name} aria-describedby="service-name-message" {...form.register("name")} />
      </FormField>

      <FormField id="service-description" label="Descrição (opcional)" error={errors.description?.message}>
        <Textarea
          id="service-description"
          rows={3}
          aria-invalid={!!errors.description}
          aria-describedby="service-description-message"
          {...form.register("description")}
        />
      </FormField>

      <FormField
        id="service-sort-order"
        label="Ordem de exibição"
        error={errors.sortOrder?.message}
        hint="Menor número aparece primeiro na lista de serviços do solicitante."
        className="sm:max-w-40"
      >
        <Input
          id="service-sort-order"
          type="number"
          inputMode="numeric"
          aria-invalid={!!errors.sortOrder}
          aria-describedby="service-sort-order-message"
          {...form.register("sortOrder", { valueAsNumber: true })}
        />
      </FormField>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
