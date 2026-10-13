"use client";

import { Search } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminDepartment } from "@/lib/catalog/types";
import { setRequesterDepartmentActive } from "@/server/catalog/actions";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function DepartmentsTable({ departments }: { departments: readonly AdminDepartment[] }) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const term = normalize(query.trim());
    // Requester departments first, then the rest alphabetically.
    return departments
      .filter((department) => !term || normalize(department.name).includes(term))
      .toSorted((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
  }, [departments, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative sm:max-w-sm">
        <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar departamento..."
          aria-label="Buscar departamento"
          className="pl-9"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Departamento</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-40">Pode abrir solicitações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((department) => (
            <TableRow key={department.id}>
              <TableCell className="font-medium">{department.name}</TableCell>
              <TableCell>
                {department.active ? (
                  <StatusBadge label="Solicitante" tone="success" />
                ) : (
                  <StatusBadge label="Sem acesso" tone="neutral" />
                )}
              </TableCell>
              <TableCell>
                <DepartmentSwitch department={department} />
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                Nenhum departamento encontrado.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

/** Disabling removes requester access from the department's members, so it asks first. */
function DepartmentSwitch({ department }: { department: AdminDepartment }) {
  const [optimistic, setOptimistic] = useOptimistic(department.active);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const apply = (active: boolean) =>
    startTransition(async () => {
      setOptimistic(active);
      const result = await setRequesterDepartmentActive(department.id, active);
      if (result.ok) {
        toast.success(active ? `${department.name} pode abrir solicitações.` : `${department.name} não pode mais abrir solicitações.`);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <>
      <Switch
        checked={optimistic}
        disabled={pending}
        aria-label={`${department.name} pode abrir solicitações`}
        onCheckedChange={(next) => (next ? apply(true) : setConfirming(true))}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {department.name} dos solicitantes?</AlertDialogTitle>
            <AlertDialogDescription>
              Os membros deste departamento deixarão de acessar o GC Service Desk como solicitantes. Os serviços do
              departamento e o histórico são mantidos, e o acesso pode ser reativado a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => apply(false)}>
              Remover acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
