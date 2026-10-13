"use client";

import { createContext, use, type ReactNode } from "react";

import type { Viewer } from "@/server/auth/viewer";

const ViewerContext = createContext<Viewer | null>(null);

/**
 * Exposes the server-resolved viewer to client components for display only.
 * Authorization decisions are always made on the server.
 */
export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export function useViewer(): Viewer {
  const viewer = use(ViewerContext);
  if (!viewer) throw new Error("useViewer must be used within a ViewerProvider.");
  return viewer;
}
