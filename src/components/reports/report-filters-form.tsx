"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/admin/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_KINDS, type ServiceKind } from "@/lib/catalog/field-types";
import {
  addDays,
  MAX_PERIOD_DAYS,
  REPORT_PERIODS,
  reportFiltersToSearch,
  reportPeriodLabels,
  type ReportFilters,
  type ReportPeriod,
} from "@/lib/requests/report-filters";

const ALL = "all";

const kindLabels: Record<ServiceKind, string> = { standard: "Novas solicitações", correction: "Correções / Refazer" };

type ReportFiltersFormProps = {
  filters: ReportFilters;
  departments: readonly { id: number; name: string }[];
  services: readonly { id: string; dptoId: number; name: string; active: boolean }[];
};

/** Filter state lives in the URL; the server re-parses and validates it. */
export function ReportFiltersForm({ filters, departments, services }: ReportFiltersFormProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<ReportPeriod>(filters.period);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [department, setDepartment] = useState(filters.department ? String(filters.department) : ALL);
  const [service, setService] = useState(filters.service ?? ALL);
  const [kind, setKind] = useState<string>(filters.kind ?? ALL);
  const [error, setError] = useState<string | null>(null);

  const departmentName = new Map(departments.map((item) => [item.id, item.name]));
  const departmentServices = services.filter((item) => department === ALL || String(item.dptoId) === department);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (period === "custom") {
      if (!from || !to || from > to) return setError("Informe a data inicial e a data final (inicial ≤ final).");
      if (addDays(from, MAX_PERIOD_DAYS) < to) return setError("O período pode ter no máximo dois anos.");
    }
    setError(null);
    router.push(
      `/reports${reportFiltersToSearch({
        period,
        from,
        to,
        department: department === ALL ? null : Number(department),
        service: service === ALL ? null : service,
        kind: kind === ALL ? null : (kind as ServiceKind),
      })}`,
    );
  };

  return (
    <form onSubmit={apply} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <FormField id="report-period" label="Período (abertura)">
          <Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriod)}>
            <SelectTrigger id="report-period" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_PERIODS.map((item) => (
                <SelectItem key={item} value={item}>
                  {reportPeriodLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {period === "custom" ? (
          <>
            <FormField id="report-from" label="Data inicial" required>
              <Input id="report-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
            </FormField>
            <FormField id="report-to" label="Data final" required>
              <Input id="report-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </FormField>
          </>
        ) : null}
        <FormField id="report-department" label="Departamento">
          <Select
            value={department}
            onValueChange={(value) => {
              setDepartment(value);
              setService(ALL);
            }}
          >
            <SelectTrigger id="report-department" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os departamentos</SelectItem>
              {departments.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="report-service" label="Serviço" hint="Com um serviço selecionado, o CSV inclui os campos do formulário.">
          <Select value={service} onValueChange={setService}>
            <SelectTrigger id="report-service" className="w-full" aria-describedby="report-service-message">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os serviços</SelectItem>
              {departmentServices.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                  {department === ALL ? ` (${departmentName.get(item.dptoId) ?? "—"})` : null}
                  {item.active ? null : " — inativo"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="report-kind" label="Tipo">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="report-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {SERVICE_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {kindLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => router.push("/reports")}>
          <X aria-hidden />
          Limpar filtros
        </Button>
        <Button type="submit">
          <Search aria-hidden />
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}
