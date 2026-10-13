"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toIdentifier } from "@/lib/catalog/field-row";
import {
  fieldTypeHasLength,
  fieldTypeHasOptions,
  fieldTypeLabels,
  SUPPORTED_FIELD_TYPES,
} from "@/lib/catalog/field-types";
import { fieldFormSchema, type FieldFormInput, type FieldFormValues } from "@/lib/catalog/schemas";
import type { AdminServiceField } from "@/lib/catalog/types";
import { createField, updateField } from "@/server/catalog/actions";

import { applyServerErrors } from "./apply-server-errors";
import { FormField } from "./form-field";

type FieldFormDialogProps = { mode: "create"; serviceId: string } | { mode: "edit"; field: AdminServiceField };

export function FieldFormDialog(props: FieldFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isCreate = props.mode === "create";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isCreate ? (
          <Button>
            <Plus aria-hidden />
            Adicionar campo
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label={`Editar campo ${props.field.label}`}>
            <Pencil aria-hidden />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Novo campo" : "Editar campo"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "A chave e o tipo não poderão ser alterados depois de criados."
              : "Chave e tipo são fixos. Para mudá-los, desative este campo e crie outro."}
          </DialogDescription>
        </DialogHeader>
        {open ? <FieldForm {...props} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function defaultValues(props: FieldFormDialogProps): FieldFormInput {
  if (props.mode === "create") {
    return {
      label: "",
      fieldKey: "",
      fieldType: "text",
      required: true,
      placeholder: "",
      helpText: "",
      options: [],
      minLength: "",
      maxLength: "",
      min: "",
      max: "",
    };
  }
  const { field } = props;
  return {
    label: field.label,
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    required: field.required,
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    options: field.options,
    minLength: field.validation.minLength ?? "",
    maxLength: field.validation.maxLength ?? "",
    min: field.validation.min ?? "",
    max: field.validation.max ?? "",
  };
}

function FieldForm(props: FieldFormDialogProps & { onDone: () => void }) {
  const isCreate = props.mode === "create";
  const form = useForm<FieldFormInput, unknown, FieldFormValues>({
    resolver: zodResolver(fieldFormSchema),
    defaultValues: defaultValues(props),
  });
  const { errors, isSubmitting } = form.formState;
  const options = useFieldArray({ control: form.control, name: "options" });
  const fieldType = useWatch({ control: form.control, name: "fieldType" });
  // The key follows the label until the administrator edits it by hand.
  const [keyEdited, setKeyEdited] = useState(!isCreate);

  const labelField = form.register("label", {
    onChange: (event: { target: { value: string } }) => {
      if (isCreate && !keyEdited) form.setValue("fieldKey", toIdentifier(event.target.value));
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      ...values,
      placeholder: values.placeholder ?? "",
      helpText: values.helpText ?? "",
    };
    const result = isCreate ? await createField(props.serviceId, payload) : await updateField(props.field.id, payload);
    if (!result.ok) return applyServerErrors(result, form.setError);

    toast.success(isCreate ? "Campo adicionado." : "Campo atualizado.");
    props.onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField id="field-label" label="Rótulo" error={errors.label?.message}>
        <Input id="field-label" aria-invalid={!!errors.label} aria-describedby="field-label-message" {...labelField} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="field-key"
          label="Chave (key)"
          error={errors.fieldKey?.message}
          hint={isCreate ? "Identificador técnico, gerado a partir do rótulo." : undefined}
        >
          <Input
            id="field-key"
            className="font-mono"
            readOnly={!isCreate}
            aria-invalid={!!errors.fieldKey}
            aria-describedby="field-key-message"
            {...form.register("fieldKey", { onChange: () => setKeyEdited(true) })}
          />
        </FormField>

        <FormField id="field-type" label="Tipo" error={errors.fieldType?.message}>
          {isCreate ? (
            <Controller
              control={form.control}
              name="fieldType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="field-type" className="w-full" aria-describedby="field-type-message">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_FIELD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {fieldTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <Input id="field-type" readOnly value={fieldTypeLabels[fieldType]} />
          )}
        </FormField>
      </div>

      <Controller
        control={form.control}
        name="required"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Checkbox id="field-required" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
            <Label htmlFor="field-required">Preenchimento obrigatório</Label>
          </div>
        )}
      />

      {fieldTypeHasOptions(fieldType) ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Opções</legend>
          {options.fields.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma opção cadastrada.</p> : null}
          {options.fields.map((option, index) => {
            const saved = option.value !== "";
            const optionError = errors.options?.[index]?.label?.message;
            return (
              <div key={option.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Opção ${index + 1}`}
                    aria-invalid={!!optionError}
                    {...form.register(`options.${index}.label`)}
                  />
                  <Controller
                    control={form.control}
                    name={`options.${index}.active`}
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label={`Opção ${index + 1} ativa`}
                      />
                    )}
                  />
                  {/* Saved options may be referenced by requests: deactivate instead of removing. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={saved}
                    title={saved ? "Opções salvas não podem ser removidas; desative-as." : undefined}
                    aria-label={`Remover opção ${index + 1}`}
                    onClick={() => options.remove(index)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                {optionError ? <p className="text-xs text-destructive">{optionError}</p> : null}
              </div>
            );
          })}
          {errors.options?.message ?? errors.options?.root?.message ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.options?.message ?? errors.options?.root?.message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => options.append({ value: "", label: "", active: true })}
          >
            <Plus aria-hidden />
            Adicionar opção
          </Button>
        </fieldset>
      ) : null}

      {fieldTypeHasLength(fieldType) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="field-min-length" label="Mínimo de caracteres (opcional)" error={errors.minLength?.message}>
            <Input id="field-min-length" type="number" inputMode="numeric" {...form.register("minLength", { valueAsNumber: true })} />
          </FormField>
          <FormField id="field-max-length" label="Máximo de caracteres (opcional)" error={errors.maxLength?.message}>
            <Input id="field-max-length" type="number" inputMode="numeric" {...form.register("maxLength", { valueAsNumber: true })} />
          </FormField>
        </div>
      ) : null}

      {fieldType === "number" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="field-min" label="Valor mínimo (opcional)" error={errors.min?.message}>
            <Input id="field-min" type="number" step="any" {...form.register("min", { valueAsNumber: true })} />
          </FormField>
          <FormField id="field-max" label="Valor máximo (opcional)" error={errors.max?.message}>
            <Input id="field-max" type="number" step="any" {...form.register("max", { valueAsNumber: true })} />
          </FormField>
        </div>
      ) : null}

      <FormField id="field-placeholder" label="Texto de exemplo (opcional)" error={errors.placeholder?.message}>
        <Input id="field-placeholder" aria-describedby="field-placeholder-message" {...form.register("placeholder")} />
      </FormField>

      <FormField id="field-help" label="Texto de ajuda (opcional)" error={errors.helpText?.message}>
        <Input id="field-help" aria-describedby="field-help-message" {...form.register("helpText")} />
      </FormField>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
