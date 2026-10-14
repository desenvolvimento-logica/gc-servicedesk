"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/catalog/types";
import { REQUEST_STATUSES } from "@/lib/requests/status";
import { NOTE_MAX_LENGTH } from "@/lib/requests/workflow";
import { getStaff } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { workflowErrorMessage } from "./errors";

/**
 * Staff actions on a request. Each one re-checks the staff role and
 * validates its arguments; the database RPCs check the role again, lock the
 * request, enforce the transitions and append the history event.
 */

const requestIdSchema = z.uuid();
const assigneeSchema = z.number().int().positive().nullable();
const statusSchema = z.enum(REQUEST_STATUSES).exclude(["open"]);
const noteSchema = z
  .string()
  .trim()
  .min(1, "Escreva a observação.")
  .max(NOTE_MAX_LENGTH, `Use no máximo ${NOTE_MAX_LENGTH} caracteres.`);

const INVALID_MESSAGE = "Dados inválidos. Atualize a página e tente novamente.";
const INVALID_INPUT: ActionResult<never> = { ok: false, message: INVALID_MESSAGE };

type RpcCall = (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{
  error: { code?: string; message?: string } | null;
}>;

async function runStaffRpc(call: RpcCall): Promise<ActionResult> {
  if (!(await getStaff())) return { ok: false, message: FORBIDDEN_MESSAGE };

  const supabase = await createSupabaseServerClient();
  const { error } = await call(supabase);
  // Refresh even on failure: a conflict usually means the page is stale.
  refresh();
  return error ? { ok: false, message: workflowErrorMessage(error) } : { ok: true, data: undefined };
}

export async function assignRequest(requestId: unknown, assigneeId: unknown): Promise<ActionResult> {
  const id = requestIdSchema.safeParse(requestId);
  const assignee = assigneeSchema.safeParse(assigneeId);
  if (!id.success || !assignee.success) return INVALID_INPUT;

  return runStaffRpc((supabase) =>
    supabase.rpc("gestao_cadastros_assign_request", { p_request_id: id.data, p_assignee_id: assignee.data }),
  );
}

export async function changeRequestStatus(requestId: unknown, status: unknown): Promise<ActionResult> {
  const id = requestIdSchema.safeParse(requestId);
  const next = statusSchema.safeParse(status);
  if (!id.success || !next.success) return INVALID_INPUT;

  return runStaffRpc((supabase) =>
    supabase.rpc("gestao_cadastros_change_request_status", { p_request_id: id.data, p_status: next.data }),
  );
}

export async function addInternalNote(requestId: unknown, text: unknown): Promise<ActionResult> {
  const id = requestIdSchema.safeParse(requestId);
  if (!id.success) return INVALID_INPUT;
  const note = noteSchema.safeParse(text);
  if (!note.success) {
    const messages = note.error.issues.map((issue) => issue.message);
    return { ok: false, message: messages[0] ?? INVALID_MESSAGE, fieldErrors: { text: messages } };
  }

  return runStaffRpc((supabase) =>
    supabase.rpc("gestao_cadastros_add_internal_note", { p_request_id: id.data, p_text: note.data }),
  );
}
