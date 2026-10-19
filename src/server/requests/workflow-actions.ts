"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/catalog/types";
import { REQUEST_STATUSES } from "@/lib/requests/status";
import { NOTE_MAX_LENGTH } from "@/lib/requests/workflow";
import { getSession, getStaff } from "@/server/auth/session";
import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { workflowErrorMessage } from "./errors";

/**
 * Workflow actions on a request. Each one re-checks the role and validates
 * its arguments; the database RPCs check the role again, lock the
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

/**
 * "Observações": a comment visible to the requester and the staff. Not a
 * staff-only action: the RPC allows staff on any request and requesters on
 * their own (others get "not found").
 */
export async function addComment(requestId: unknown, text: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (session.status !== "authorized") return { ok: false, message: FORBIDDEN_MESSAGE };

  const id = requestIdSchema.safeParse(requestId);
  if (!id.success) return INVALID_INPUT;
  const note = noteSchema.safeParse(text);
  if (!note.success) {
    const messages = note.error.issues.map((issue) => issue.message);
    return { ok: false, message: messages[0] ?? INVALID_MESSAGE, fieldErrors: { text: messages } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("gestao_cadastros_add_comment", { p_request_id: id.data, p_text: note.data });
  refresh();
  return error ? { ok: false, message: workflowErrorMessage(error) } : { ok: true, data: undefined };
}
