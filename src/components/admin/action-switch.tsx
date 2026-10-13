"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/catalog/types";

type ActionSwitchProps = {
  checked: boolean;
  label: string;
  onToggle: (checked: boolean) => Promise<ActionResult>;
  /** Shown after a successful change. */
  successMessage: (checked: boolean) => string;
  disabled?: boolean;
};

/** Switch bound to a Server Action, updated optimistically and reverted on failure. */
export function ActionSwitch({ checked, label, onToggle, successMessage, disabled }: ActionSwitchProps) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) =>
    startTransition(async () => {
      setOptimistic(next);
      const result = await onToggle(next);
      if (result.ok) toast.success(successMessage(next));
      else toast.error(result.message);
    });

  return (
    <Switch
      checked={optimistic}
      onCheckedChange={toggle}
      disabled={disabled || pending}
      aria-label={label}
    />
  );
}
