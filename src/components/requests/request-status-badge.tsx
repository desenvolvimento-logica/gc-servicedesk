import { StatusBadge } from "@/components/status-badge";
import { requestStatusLabels, requestStatusTones, type RequestStatus } from "@/lib/requests/status";

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <StatusBadge label={requestStatusLabels[status]} tone={requestStatusTones[status]} />;
}
