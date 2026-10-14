"use client";

import { Controller, type Control, type UseFormRegister } from "react-hook-form";

import { FormField } from "@/components/admin/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { maxLengthOf, type RequestFormField, type RequestFormInput, type RequestPayload } from "@/lib/requests/form-schema";

type DynamicFieldProps = {
  field: RequestFormField;
  control: Control<RequestFormInput, unknown, RequestPayload>;
  register: UseFormRegister<RequestFormInput>;
  error?: string;
};

const inputTypes = { text: "text", email: "email", date: "date", number: "number" } as const;

/** Renders one request form control from its field metadata. */
export function DynamicField({ field, control, register, error }: DynamicFieldProps) {
  const id = `request-field-${field.fieldKey}`;
  const common = {
    id,
    "aria-invalid": !!error,
    "aria-describedby": `${id}-message`,
    "aria-required": field.required,
  };

  return (
    <FormField
      id={id}
      label={field.label}
      required={field.required}
      error={error}
      hint={field.helpText ?? undefined}
      className={field.fieldType === "textarea" || field.fieldType === "multiselect" ? "sm:col-span-full" : undefined}
    >
      {renderControl()}
    </FormField>
  );

  function renderControl() {
    switch (field.fieldType) {
      case "text":
      case "email":
      case "date":
      case "number":
        return (
          <Input
            {...common}
            type={inputTypes[field.fieldType]}
            step={field.fieldType === "number" ? "any" : undefined}
            inputMode={field.fieldType === "number" ? "decimal" : undefined}
            maxLength={field.fieldType === "text" ? maxLengthOf(field) : undefined}
            placeholder={field.placeholder ?? undefined}
            {...register(field.fieldKey)}
          />
        );
      case "textarea":
        return (
          <Textarea
            {...common}
            rows={3}
            maxLength={maxLengthOf(field)}
            placeholder={field.placeholder ?? undefined}
            {...register(field.fieldKey)}
          />
        );
      case "boolean":
        return (
          <OptionSelect
            field={field}
            control={control}
            common={common}
            options={[
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ]}
          />
        );
      case "select":
        return <OptionSelect field={field} control={control} common={common} options={field.options} />;
      case "multiselect":
        return (
          <Controller
            control={control}
            name={field.fieldKey}
            render={({ field: controller }) => {
              const selected = Array.isArray(controller.value) ? controller.value : [];
              return (
                <div
                  id={id}
                  role="group"
                  aria-label={field.label}
                  aria-describedby={`${id}-message`}
                  className={cn(
                    "grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3",
                    error && "border-destructive",
                  )}
                >
                  {field.options.map((option) => {
                    const optionId = `${id}-${option.value}`;
                    return (
                      <div key={option.value} className="flex items-center gap-2">
                        <Checkbox
                          id={optionId}
                          checked={selected.includes(option.value)}
                          onCheckedChange={(checked) =>
                            controller.onChange(
                              checked === true
                                ? [...selected, option.value]
                                : selected.filter((value) => value !== option.value),
                            )
                          }
                        />
                        <Label htmlFor={optionId} className="font-normal">
                          {option.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
        );
      case "file":
        return <p className="text-sm text-muted-foreground">Anexos ainda não estão disponíveis.</p>;
    }
  }
}

type OptionSelectProps = {
  field: RequestFormField;
  control: Control<RequestFormInput, unknown, RequestPayload>;
  common: Record<string, unknown>;
  options: readonly { value: string; label: string }[];
};

function OptionSelect({ field, control, common, options }: OptionSelectProps) {
  return (
    <Controller
      control={control}
      name={field.fieldKey}
      render={({ field: controller }) => (
        <Select value={typeof controller.value === "string" ? controller.value : ""} onValueChange={controller.onChange}>
          <SelectTrigger {...common} className="w-full" onBlur={controller.onBlur}>
            <SelectValue placeholder={field.placeholder ?? "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}
