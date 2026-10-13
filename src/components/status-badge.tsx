import { CheckCircle2, Circle, CircleDot, Clock, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Visual tone of a status. The status vocabulary itself comes from the
 * database; each status is mapped to one of these tones.
 */
export type StatusTone = "info" | "warning" | "success" | "danger" | "neutral";

const toneStyles: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  info: { className: "bg-status-info-soft text-status-info", icon: CircleDot },
  warning: { className: "bg-status-warning-soft text-status-warning", icon: Clock },
  success: { className: "bg-status-success-soft text-status-success", icon: CheckCircle2 },
  danger: { className: "bg-status-danger-soft text-status-danger", icon: XCircle },
  neutral: { className: "bg-muted text-muted-foreground", icon: Circle },
};

type StatusBadgeProps = {
  label: string;
  tone: StatusTone;
  className?: string;
};

export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  const { className: toneClassName, icon: Icon } = toneStyles[tone];

  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        toneClassName,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
