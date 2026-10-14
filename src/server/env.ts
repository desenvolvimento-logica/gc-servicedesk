import "server-only";

import { z } from "zod";

/**
 * Server-only secrets, used only by the Acessórias company sync. Read lazily
 * so the rest of the app works (and builds) without them. Never prefix these
 * with NEXT_PUBLIC_: they must not reach the browser.
 */
const syncEnvSchema = z.object({
  /** Supabase secret key (service_role): writes the synchronized companies. */
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1)
    .refine((key) => !key.startsWith("sb_publishable_"), "Use the secret key, not the publishable key."),
  /** Acessórias API token (Acessórias → ⚙ → API Token). */
  ACESSORIAS_API_TOKEN: z.string().min(1),
});

export type SyncEnv = z.infer<typeof syncEnvSchema>;

export function getSyncEnv(): SyncEnv | null {
  const parsed = syncEnvSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ACESSORIAS_API_TOKEN: process.env.ACESSORIAS_API_TOKEN,
  });
  return parsed.success ? parsed.data : null;
}

/** Shared secret Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>`. */
export function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}
