import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

/**
 * Supabase client with the SECRET key (service_role): bypasses RLS. Use it
 * only for the Acessórias company sync, which is the single writer of the
 * company tables. Never import it from client code or request-scoped reads.
 */
export function createSupabaseAdminClient(secretKey: string) {
  return createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
