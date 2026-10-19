"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleCheckBig, ClipboardList, FileText, Info, Plus, Send, Settings } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { applyServerErrors } from "@/components/admin/apply-server-errors";
import { FormField } from "@/components/admin/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildRequestSchema,
  defaultRequestValues,
  type RequestFormInput,
  type RequestPayload,
} from "@/lib/requests/form-schema";
import type { Company } from "@/lib/companies/types";
import { companyFieldValues } from "@/lib/requests/company-prefill";
import { COMPANY_CODE_FIELD, COMPANY_NAME_FIELD, companyPrefill, ORIGINAL_REQUEST_FIELD } from "@/lib/requests/corrections";
import { formatPendingValue } from "@/lib/requests/format";
import type { CorrectableRequest, CreatedRequest, RequestableDepartment, RequestableService } from "@/lib/requests/types";
import { createRequest } from "@/server/requests/actions";

import { CompanyPicker } from "./company-picker";
import { DynamicField } from "./dynamic-field";
import { OriginalRequestPicker } from "./original-request-picker";
import { RequestSteps, type RequestStep } from "./request-steps";

type NewRequestWizardProps = {
  departments: readonly RequestableDepartment[];
  /** Preselection for "Solicitar correção" from a closed request. */
  initialCorrection?: { departmentId: number; serviceId: string; original: CorrectableRequest };
};

/** Department → service → dynamic form → review → confirmation. */
export function NewRequestWizard({ departments, initialCorrection }: NewRequestWizardProps) {
  const [departmentId, setDepartmentId] = useState(
    initialCorrection ? String(initialCorrection.departmentId) : departments.length === 1 ? String(departments[0]?.id) : "",
  );
  const [serviceId, setServiceId] = useState(initialCorrection?.serviceId ?? "");
  const [step, setStep] = useState<RequestStep>("fill");
  const [created, setCreated] = useState<CreatedRequest | null>(null);
  // Used only by the first correction form rendered for the preselected service.
  const [initialOriginal, setInitialOriginal] = useState(initialCorrection?.original ?? null);

  const department = departments.find((item) => String(item.id) === departmentId);
  const service = department?.services.find((item) => item.id === serviceId);
  const locked = step !== "fill";

  const changeStep = (next: RequestStep) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startOver = () => {
    setCreated(null);
    setInitialOriginal(null);
    setServiceId("");
    changeStep("fill");
  };

  if (step === "done" && created) {
    return (
      <div className="flex flex-col gap-6">
        <RequestSteps current="done" />
        <SuccessCard created={created} onNewRequest={startOver} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RequestSteps current={step} />
      <Card>
        <CardContent className="flex flex-col gap-8">
          <section aria-labelledby="initial-data-title" className="flex flex-col gap-4">
            <h2 id="initial-data-title" className="flex items-center gap-2 text-lg font-semibold">
              <Settings aria-hidden className="size-5 text-brand-ink" />
              Dados iniciais
            </h2>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_minmax(0,1.1fr)]">
              <FormField id="request-department" label="Departamento" required>
                <Select
                  value={departmentId}
                  disabled={locked || departments.length === 1}
                  onValueChange={(value) => {
                    setDepartmentId(value);
                    setServiceId("");
                  }}
                >
                  <SelectTrigger id="request-department" className="w-full">
                    <SelectValue placeholder="Selecione o departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="request-service" label="Tipo de serviço" required>
                <Select value={serviceId} disabled={locked || !department} onValueChange={setServiceId}>
                  <SelectTrigger id="request-service" className="w-full">
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {department?.services.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <p className="flex items-start gap-2 self-end rounded-lg bg-status-info-soft p-3 text-sm text-status-info">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                Os campos do formulário são adaptados de acordo com o serviço selecionado.
              </p>
            </div>
          </section>

          {service ? (
            <RequestForm
              key={service.id}
              service={service}
              initialOriginal={service.id === initialCorrection?.serviceId ? initialOriginal : null}
              step={step}
              onStepChange={changeStep}
              onCreated={(result) => {
                setCreated(result);
                changeStep("done");
              }}
            />
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Selecione o departamento e o tipo de serviço para preencher a solicitação.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type RequestFormProps = {
  service: RequestableService;
  initialOriginal: CorrectableRequest | null;
  step: RequestStep;
  onStepChange: (step: RequestStep) => void;
  onCreated: (created: CreatedRequest) => void;
};

const ORIGINAL_REQUIRED_MESSAGE = "Selecione a solicitação original.";

function RequestForm({ service, initialOriginal, step, onStepChange, onCreated }: RequestFormProps) {
  const isCorrection = service.kind === "correction";
  const hasCompanyFields = [COMPANY_NAME_FIELD, COMPANY_CODE_FIELD].every((key) =>
    service.fields.some((field) => field.fieldKey === key),
  );
  const schema = useMemo(() => buildRequestSchema(service.fields), [service.fields]);
  const form = useForm<RequestFormInput, unknown, RequestPayload>({
    resolver: zodResolver(schema),
    defaultValues: initialOriginal
      ? { ...defaultRequestValues(service.fields), ...companyPrefill(service.fields, {}, initialOriginal) }
      : defaultRequestValues(service.fields),
  });
  const [original, setOriginal] = useState<CorrectableRequest | null>(initialOriginal);
  const [originalError, setOriginalError] = useState<string | undefined>();
  const [review, setReview] = useState<RequestPayload | null>(null);
  const [sending, setSending] = useState(false);
  const { errors } = form.formState;

  const selectOriginal = (next: CorrectableRequest | null) => {
    setOriginal(next);
    setOriginalError(undefined);
    if (!next) return;
    for (const [key, value] of Object.entries(companyPrefill(service.fields, form.getValues(), next))) {
      if (value) form.setValue(key, value, { shouldValidate: form.formState.isSubmitted });
    }
  };

  const selectCompany = (company: Company) => {
    const options = { shouldValidate: form.formState.isSubmitted, shouldDirty: true };
    for (const [key, value] of Object.entries(companyFieldValues(service.fields, company))) {
      form.setValue(key, value, options);
    }
  };

  const submitReview = form.handleSubmit((payload) => {
    if (isCorrection && !original) return;
    setReview(payload);
    onStepChange("review");
  });

  const onReview = (event: React.FormEvent<HTMLFormElement>) => {
    if (isCorrection && !original) setOriginalError(ORIGINAL_REQUIRED_MESSAGE);
    return submitReview(event);
  };

  const onSend = async () => {
    setSending(true);
    try {
      // The server reloads the field definitions and validates the raw values again.
      const result = await createRequest({
        serviceId: service.id,
        values: form.getValues(),
        originalRequestId: original?.id ?? null,
      });
      if (!result.ok) {
        if (result.fieldErrors) onStepChange("fill");
        const { [ORIGINAL_REQUEST_FIELD]: originalMessages, ...fieldErrors } = result.fieldErrors ?? {};
        if (originalMessages?.[0]) setOriginalError(originalMessages[0]);
        applyServerErrors({ ...result, fieldErrors }, form.setError);
        return;
      }
      onCreated(result.data);
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="service-data-title" className="flex flex-col gap-4 border-t pt-6">
      <div className="space-y-1">
        <h2 id="service-data-title" className="flex items-center gap-2 text-lg font-semibold">
          <FileText aria-hidden className="size-5 text-brand-ink" />
          Dados do serviço – {service.name}
        </h2>
        {service.description ? <p className="text-sm text-muted-foreground">{service.description}</p> : null}
      </div>

      {step === "fill" ? (
        <form onSubmit={onReview} noValidate className="flex flex-col gap-6">
          {isCorrection ? (
            <OriginalRequestPicker serviceId={service.id} value={original} onChange={selectOriginal} error={originalError} />
          ) : null}
          {hasCompanyFields ? <CompanyPicker onSelect={selectCompany} /> : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {service.fields.map((field) => (
              <DynamicField
                key={field.id}
                field={field}
                control={form.control}
                register={form.register}
                error={errorMessage(errors[field.fieldKey]?.message)}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg">
              <ClipboardList aria-hidden />
              Revisar solicitação
            </Button>
          </div>
        </form>
      ) : review ? (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Confira os dados abaixo. Depois de enviada, a solicitação não poderá ser alterada por você.
          </p>
          <dl className="grid gap-x-6 gap-y-4 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-3">
            {original ? (
              <div className="sm:col-span-full">
                <dt className="text-xs font-medium text-muted-foreground">Solicitação original</dt>
                <dd className="mt-0.5 text-sm">
                  <span className="font-mono font-semibold">{original.requestNumber}</span> · {original.serviceName}
                </dd>
              </div>
            ) : null}
            {service.fields.map((field) => (
              <div
                key={field.id}
                className={field.fieldType === "textarea" || field.fieldType === "multiselect" ? "sm:col-span-full" : undefined}
              >
                <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
                <dd className="mt-0.5 text-sm break-words whitespace-pre-wrap">
                  {formatPendingValue(field, review[field.fieldKey] ?? null)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <Button type="button" variant="outline" size="lg" disabled={sending} onClick={() => onStepChange("fill")}>
              <ArrowLeft aria-hidden />
              Voltar e editar
            </Button>
            <Button type="button" size="lg" disabled={sending} onClick={onSend}>
              <Send aria-hidden />
              {sending ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const errorMessage = (message: unknown) => (typeof message === "string" ? message : undefined);

function SuccessCard({ created, onNewRequest }: { created: CreatedRequest; onNewRequest: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-status-success-soft text-status-success">
          <CircleCheckBig aria-hidden className="size-7" />
        </span>
        <div className="space-y-1" role="status">
          <h2 className="text-xl font-semibold">Solicitação enviada</h2>
          <p className="text-sm text-muted-foreground">Guarde o protocolo para acompanhar o atendimento.</p>
        </div>
        <p className="rounded-lg bg-brand-soft px-4 py-2 font-mono text-2xl font-bold tracking-wide text-brand-ink">
          {created.requestNumber}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={`/requests/${created.id}`}>Ver solicitação</Link>
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onNewRequest}>
            <Plus aria-hidden />
            Nova solicitação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
