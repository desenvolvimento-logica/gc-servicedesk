import { History, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { UsersTable } from "@/components/admin/users-table";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { gcRoleLabels } from "@/lib/admin/users";
import { formatDateTime } from "@/lib/requests/format";
import { listAdminUsers, listRoleEvents } from "@/server/admin/users";
import { requireAdministrator } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Usuários e Papéis",
};

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="Usuários e Papéis" breadcrumbs={[{ label: "Administração" }, { label: "Usuários" }]} />
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Users aria-hidden className="size-5" />
              Usuários
            </CardTitle>
            <CardDescription>
              Os usuários vêm do cadastro corporativo. Quem pertence a um departamento solicitante já pode abrir
              solicitações; aqui você define quem atende (operador) e quem configura o sistema (administrador).
              Remover um papel apenas o desativa — o histórico é mantido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              <UsersContent />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <History aria-hidden className="size-5" />
              Alterações recentes de papéis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
              <RoleHistory />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function UsersContent() {
  const [viewer, users] = await Promise.all([requireAdministrator(), listAdminUsers()]);
  return <UsersTable users={users} viewerUserId={viewer.userId} />;
}

async function RoleHistory() {
  const events = await listRoleEvents();
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="text-sm">
          <span className="font-medium">{event.userName ?? "—"}</span>{" "}
          {event.granted ? "recebeu" : "perdeu"} o papel de {gcRoleLabels[event.role].toLowerCase()}
          <span className="block text-xs text-muted-foreground">
            {formatDateTime(event.createdAt)} · por {event.actorName ?? "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
