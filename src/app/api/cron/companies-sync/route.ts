import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { runCompanySync } from "@/server/companies/run-sync";
import { getCronSecret } from "@/server/env";

/**
 * Daily Acessórias company sync, called by Vercel Cron (vercel.json) with
 * `Authorization: Bearer <CRON_SECRET>`. No user session: the secret is the
 * only way in, so the proxy lets this path through.
 */
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = getCronSecret();
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const result = await runCompanySync("cron", null);
  const status = result.status === "success" || result.status === "skipped" ? 200 : 500;
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
