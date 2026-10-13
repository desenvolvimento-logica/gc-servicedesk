import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/catalog/types";

/**
 * Shows a failed action result: per-field messages on the form (when the
 * server rejected specific fields) and the summary as a toast.
 */
export function applyServerErrors<T extends FieldValues>(result: Extract<ActionResult<unknown>, { ok: false }>, setError?: UseFormSetError<T>) {
  if (setError && result.fieldErrors) {
    for (const [name, messages] of Object.entries(result.fieldErrors)) {
      const message = messages?.[0];
      if (message) setError(name as Path<T>, { type: "server", message });
    }
  }
  toast.error(result.message);
}
