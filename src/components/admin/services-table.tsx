"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { serviceKindLabels } from "@/lib/catalog/field-types";
import type { AdminServiceSummary } from "@/lib/catalog/types";

const ALL = "all";

type ServicesTableProps = {
  services: readonly AdminServiceSummary[];
  departments: readonly { id: number; name: string }[];
};

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function ServicesTable({ services, departments }: ServicesTableProps) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const visible = useMemo(() => {
    const term = normalize(query.trim());
    return services
      .filter((service) => department === ALL || String(service.dptoId) === department)
      .filter((service) => status === ALL || (status === "active") === service.active)
      .filter((service) => !term || normalize(`${service.name} ${service.departmentName}`).includes(term))
      .toSorted(
        (a, b) =>
          a.departmentName.localeCompare(b.departmentName, "pt-BR") ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
  }, [services, query, department, status]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar serviço ou departamento..."
            aria-label="Buscar serviço ou departamento"
            className="pl-9"
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar por departamento">
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serviço</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Campos ativos</TableHead>
            <TableHead>Atualizado em</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((service) => (
            <TableRow key={service.id}>
              <TableCell className="font-medium">
                <Link href={`/admin/services/${service.id}`} className="hover:underline">
                  {service.name}
                </Link>
                {service.kind === "correction" ? (
                  <Badge variant="outline" className="ml-2">
                    {serviceKindLabels.correction}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{service.departmentName}</TableCell>
              <TableCell>
                <StatusBadge label={service.active ? "Ativo" : "Inativo"} tone={service.active ? "success" : "neutral"} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {service.activeFieldCount}
                {service.activeFieldCount !== service.fieldCount ? (
                  <span className="text-muted-foreground"> / {service.fieldCount}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{dateFormatter.format(new Date(service.updatedAt))}</TableCell>
            </TableRow>
          ))}
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                Nenhum serviço encontrado.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Exibindo {visible.length} de {services.length} serviços
      </p>
    </div>
  );
}
