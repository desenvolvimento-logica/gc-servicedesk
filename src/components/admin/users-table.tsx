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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  filterUsers,
  gcRoleLabels,
  USER_FILTERS,
  userFilterLabels,
  type AdminUser,
  type GcRole,
  type UserFilter,
} from "@/lib/admin/users";
import { setUserRole } from "@/server/admin/user-actions";

const PAGE_LIMIT = 200;

type UsersTableProps = {
  users: readonly AdminUser[];
  viewerUserId: number;
};

export function UsersTable({ users, viewerUserId }: UsersTableProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("with-role");

  const visible = useMemo(() => filterUsers(users, filter, query), [users, filter, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, e-mail ou departamento..."
            aria-label="Buscar usuário"
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as UserFilter)}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar usuários">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {USER_FILTERS.map((item) => (
              <SelectItem key={item} value={item}>
                {userFilterLabels[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Acesso</TableHead>
            <TableHead className="w-28">Operador</TableHead>
            <TableHead className="w-32">Administrador</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.slice(0, PAGE_LIMIT).map((user) => (
            <TableRow key={user.userId}>
              <TableCell>
                <span className="block font-medium">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </TableCell>
              <TableCell>{user.departmentName ?? "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {user.canOpenRequests ? <StatusBadge label="Solicitante" tone="info" /> : null}
                  {user.linked ? null : <StatusBadge label="Nunca entrou" tone="neutral" />}
                </div>
              </TableCell>
              <TableCell>
                <RoleSwitch user={user} role="operator" checked={user.isOperator} />
              </TableCell>
              <TableCell>
                <RoleSwitch
                  user={user}
                  role="administrator"
                  checked={user.isAdministrator}
                  lockedReason={
                    user.userId === viewerUserId && user.isAdministrator
                      ? "Você não pode remover o seu próprio papel de administrador."
                      : undefined
                  }
                />
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                Nenhum usuário encontrado.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {visible.length > PAGE_LIMIT
          ? `Exibindo ${PAGE_LIMIT} de ${visible.length} usuários. Refine a busca para encontrar os demais.`
          : `Exibindo ${visible.length} de ${users.length} usuários.`}
      </p>
    </div>
  );
}

type RoleSwitchProps = {
  user: AdminUser;
  role: GcRole;
  checked: boolean;
  /** Shown instead of allowing the change (e.g. own administrator role). */
  lockedReason?: string;
};

/** Revoking a role and granting administrator ask for confirmation. */
function RoleSwitch({ user, role, checked, lockedReason }: RoleSwitchProps) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const label = gcRoleLabels[role];

  const apply = (granted: boolean) =>
    startTransition(async () => {
      setOptimistic(granted);
      const result = await setUserRole(user.userId, role, granted);
      if (result.ok) toast.success(granted ? `${user.name} agora é ${label.toLowerCase()}.` : `${user.name} deixou de ser ${label.toLowerCase()}.`);
      else toast.error(result.message);
    });

  const needsConfirmation = (granted: boolean) => !granted || role === "administrator";

  return (
    <>
      <Switch
        checked={optimistic}
        disabled={pending || !!lockedReason}
        title={lockedReason}
        aria-label={`${user.name}: ${label}`}
        onCheckedChange={(granted) => (needsConfirmation(granted) ? setConfirming(granted) : apply(granted))}
      />
      <AlertDialog open={confirming !== null} onOpenChange={(open) => (open ? null : setConfirming(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming ? `Tornar ${user.name} ${label.toLowerCase()}?` : `Remover o papel de ${label.toLowerCase()} de ${user.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {role === "administrator"
                ? confirming
                  ? "Administradores configuram serviços, departamentos e papéis de usuários, e veem todas as solicitações."
                  : "A pessoa deixará de acessar a configuração do sistema."
                : "A pessoa deixará de ver a fila e de receber novas atribuições. Solicitações já atribuídas a ela continuam com ela até serem reatribuídas."}{" "}
              A alteração fica registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming ? "default" : "destructive"}
              onClick={() => {
                if (confirming !== null) apply(confirming);
                setConfirming(null);
              }}
            >
              {confirming ? "Confirmar" : "Remover papel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
