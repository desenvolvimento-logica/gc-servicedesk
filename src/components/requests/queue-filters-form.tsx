"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormField } from "@/components/admin/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACTIVE,
  ALL,
  queueFiltersToSearch,
  SEARCH_MAX_LENGTH,
  UNASSIGNED,
  type QueueFilters,
  type QueueStatusFilter,
} from "@/lib/requests/queue-filters";
import { REQUEST_STATUSES, requestStatusLabels } from "@/lib/requests/status";
import type { Operator } from "@/lib/requests/types";

type QueueFiltersFormProps = {
  filters: QueueFilters;
  departments: readonly { id: number; name: string }[];
  services: readonly { id: string; dptoId: number; name: string; active: boolean }[];
  operators: readonly Operator[];
};

const statusOptions: { value: QueueStatusFilter; label: string }[] = [
  { value: ACTIVE, label: "Em aberto (Aberta e Em andamento)" },
  ...REQUEST_STATUSES.map((status) => ({ value: status, label: requestStatusLabels[status] })),
  { value: ALL, label: "Todos os status" },
];

/** Filter state lives in the URL; the server re-parses and validates it. */
export function QueueFiltersForm({ filters, departments, services, operators }: QueueFiltersFormProps) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [status, setStatus] = useState<string>(filters.status);
  const [department, setDepartment] = useState(filters.department ? String(filters.department) : ALL);
  const [service, setService] = useState(filters.service ?? ALL);
  const [assignee, setAssignee] = useState(filters.assignee ? String(filters.assignee) : ALL);
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");

  const departmentServices = services.filter((item) => department === ALL || String(item.dptoId) === department);
  const departmentName = new Map(departments.map((item) => [item.id, item.name]));

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(
      `/queue${queueFiltersToSearch({
        q: q.trim(),
        status: status as QueueStatusFilter,
        department: department === ALL ? null : Number(department),
        service: service === ALL ? null : service,
        assignee: assignee === ALL ? null : assignee === UNASSIGNED ? UNASSIGNED : Number(assignee),
        from: from || null,
        to: to || null,
      })}`,
    );
  };

  return (
    <form onSubmit={apply} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormField id="queue-search" label="Buscar" className="sm:col-span-2">
          <div className="relative">
            <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="queue-search"
              type="search"
              value={q}
              maxLength={SEARCH_MAX_LENGTH}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Protocolo, empresa, código ou serviço"
              className="pl-9"
            />
          </div>
        </FormField>
        <FormField id="queue-status" label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="queue-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="queue-assignee" label="Responsável">
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="queue-assignee" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
              <SelectItem value={UNASSIGNED}>Não atribuídas</SelectItem>
              {operators.map((operator) => (
                <SelectItem key={operator.userId} value={String(operator.userId)}>
                  {operator.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="queue-department" label="Departamento">
          <Select
            value={department}
            onValueChange={(value) => {
              setDepartment(value);
              setService(ALL);
            }}
          >
            <SelectTrigger id="queue-department" className="w-full">
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
        <FormField id="queue-service" label="Serviço">
          <Select value={service} onValueChange={setService}>
            <SelectTrigger id="queue-service" className="w-full">
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
        <FormField id="queue-from" label="Aberta a partir de">
          <Input id="queue-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </FormField>
        <FormField id="queue-to" label="Aberta até">
          <Input id="queue-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </FormField>
      </div>
      <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => router.push("/queue")}>
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
