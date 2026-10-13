"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) throw new Error("Cannot determine request origin.");
  return `${protocol}://${host}`;
}

/** Starts the Microsoft Entra ID (Supabase "azure" provider) sign-in. */
export async function signInWithMicrosoft(formData: FormData): Promise<void> {
  const next = safeRedirectPath(formData.get("next")?.toString());
  const callback = new URL("/auth/callback", await requestOrigin());
  if (next !== "/") callback.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "email", redirectTo: callback.toString() },
  });

  if (error || !data.url) redirect("/login?error=signin");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // "local": the Supabase project is shared by other office apps; a global
  // sign-out would also end the user's sessions there.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
