import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { createSupabaseServerClient } from "@/server/supabase/server-client";

import { canOpenRequests, profileDtoSchema, resolveViewer, type Viewer, type ViewerResolution } from "./viewer";

type SessionResolution = { status: "unauthenticated" } | ViewerResolution;

/**
 * Data Access Layer entry point: validates the session and resolves the
 * caller's profile from the database. Memoized per request.
 */
export const getSession = cache(async (): Promise<SessionResolution> => {
  // Session checks compare token expiry with the current time (Date.now()
  // inside supabase-js), so they must run at request time, never during a
  // prerender — even one where cookies are available.
  await connection();

  const supabase = await createSupabaseServerClient();

  // getClaims() verifies the JWT; never trust an unverified cookie session.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims.sub) return { status: "unauthenticated" };

  const { data, error } = await supabase.rpc("gestao_cadastros_my_profile");
  if (error) throw new Error(`Failed to load profile: ${error.message}`);

  return resolveViewer(data === null ? null : profileDtoSchema.parse(data));
});

/** Requires an authorized viewer; redirects to login or the access-denied page otherwise. */
export async function requireViewer(): Promise<Viewer> {
  const session = await getSession();

  if (session.status === "unauthenticated") redirect("/login");
  if (session.status !== "authorized") redirect("/access-denied");

  return session.viewer;
}

export async function requireStaff(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isStaff) redirect("/access-denied");
  return viewer;
}

export async function requireAdministrator(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdministrator) redirect("/access-denied");
  return viewer;
}

/** For Server Actions, which report errors instead of redirecting: the administrator, or null. */
export async function getAdministrator(): Promise<Viewer | null> {
  const session = await getSession();
  return session.status === "authorized" && session.viewer.isAdministrator ? session.viewer : null;
}

/** For Server Actions: the viewer when they may open requests, or null. */
export async function getRequestOpener(): Promise<Viewer | null> {
  const session = await getSession();
  return session.status === "authorized" && canOpenRequests(session.viewer) ? session.viewer : null;
}

export async function requireRequestOpener(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!canOpenRequests(viewer)) redirect("/access-denied");
  return viewer;
}
