import "server-only";

import { z } from "zod";

import {
  ACTIVE,
  ALL,
  startOfDaySaoPaulo,
  startOfNextDaySaoPaulo,
  todaySaoPaulo,
  UNASSIGNED,
  type QueueFilters,
} from "@/lib/requests/queue-filters";
import type { Operator } from "@/lib/requests/types";
import { requireStaff } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { REQUEST_COLUMNS, requestRowsSchema, REQUESTS_PAGE_SIZE, toSummary, type RequestPage } from "./queries";

/**
 * Operational queue reads. Staff only (re-checked here); RLS lets staff read
 * every request.
 */

export async function listQueue(filters: QueueFilters, pageSize = REQUESTS_PAGE_SIZE): Promise<RequestPage> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const from = (filters.page - 1) * pageSize;

  let query = supabase.from("gestao_cadastros_requests").select(REQUEST_COLUMNS, { count: "exact" });

  if (filters.status === ACTIVE) query = query.in("status", ["open", "in_progress"]);
  else if (filters.status !== ALL) query = query.eq("status", filters.status);
  if (filters.kind) query = query.eq("service_kind", filters.kind);
  if (filters.department) query = query.eq("dpto_id", filters.department);
  if (filters.service) query = query.eq("service_id", filters.service);
  if (filters.assignee === UNASSIGNED) query = query.is("assigned_to", null);
  else if (filters.assignee) query = query.eq("assigned_to", filters.assignee);
  if (filters.from) query = query.gte("opened_at", startOfDaySaoPaulo(filters.from));
  if (filters.to) query = query.lt("opened_at", startOfNextDaySaoPaulo(filters.to));
  if (filters.q) {
    // The term is sanitized (no commas, parentheses, quotes or wildcards).
    const pattern = `"*${filters.q}*"`;
    query = query.or(
      ["request_number", "company_name", "company_code", "service_name"].map((column) => `${column}.ilike.${pattern}`).join(","),
    );
  }

  const { data, error, count } = await query
    .order("opened_at", { ascending: false })
    .order("id")
    .range(from, from + pageSize - 1);
  if (error && error.code !== "PGRST103") throw new Error(`Failed to load queue: ${error.message}`);

  const total = count ?? 0;
  return {
    items: requestRowsSchema.parse(data ?? []).map(toSummary),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type QueueCounts = { open: number; inProgress: number; closedToday: number; unassigned: number };

export async function getQueueCounts(): Promise<QueueCounts> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const table = () => supabase.from("gestao_cadastros_requests").select("id", { count: "exact", head: true });

  const results = await Promise.all([
    table().eq("status", "open"),
    table().eq("status", "in_progress"),
    table().eq("status", "closed").gte("completed_at", startOfDaySaoPaulo(todaySaoPaulo())),
    table().in("status", ["open", "in_progress"]).is("assigned_to", null),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Failed to count requests: ${failed.error.message}`);

  const [open, inProgress, closedToday, unassigned] = results.map((result) => result.count ?? 0);
  return { open: open ?? 0, inProgress: inProgress ?? 0, closedToday: closedToday ?? 0, unassigned: unassigned ?? 0 };
}

const operatorRowSchema = z.object({ user_id: z.number().int(), name: z.string(), email: z.string() });

export async function listOperators(): Promise<Operator[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("gestao_cadastros_operators");
  if (error) throw new Error(`Failed to load operators: ${error.message}`);

  return z
    .array(operatorRowSchema)
    .parse(data)
    .map((row) => ({ userId: row.user_id, name: row.name, email: row.email }));
}

export type QueueService = { id: string; dptoId: number; name: string; active: boolean };

/** Every service (inactive ones too: old requests still reference them). */
export async function listQueueServices(): Promise<QueueService[]> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("gestao_cadastros_services")
    .select("id, dpto_id, name, active")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Failed to load services: ${error.message}`);

  return z
    .array(z.object({ id: z.uuid(), dpto_id: z.number().int(), name: z.string(), active: z.boolean() }))
    .parse(data)
    .map((row) => ({ id: row.id, dptoId: row.dpto_id, name: row.name, active: row.active }));
}
