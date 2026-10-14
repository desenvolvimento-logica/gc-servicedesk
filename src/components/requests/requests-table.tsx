import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPTY_VALUE, formatDateTime } from "@/lib/requests/format";
import type { RequestSummary } from "@/lib/requests/types";

import { RequestStatusBadge } from "./request-status-badge";

export function RequestsTable({ requests }: { requests: readonly RequestSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Protocolo</TableHead>
          <TableHead>Serviço</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Abertura</TableHead>
          <TableHead>Última atualização</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell className="font-mono font-medium">
              <Link href={`/requests/${request.id}`} className="text-status-info underline-offset-4 hover:underline">
                {request.requestNumber}
              </Link>
            </TableCell>
            <TableCell>
              <span className="block">{request.serviceName}</span>
              <span className="text-xs text-muted-foreground">{request.departmentName}</span>
            </TableCell>
            <TableCell>{request.companyName ?? EMPTY_VALUE}</TableCell>
            <TableCell>
              <RequestStatusBadge status={request.status} />
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{formatDateTime(request.openedAt)}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{formatDateTime(request.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
