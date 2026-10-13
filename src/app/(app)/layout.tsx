import { cookies } from "next/headers";
import { Suspense } from "react";

import { ViewerProvider } from "@/components/auth/viewer-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { buildNavigation } from "@/components/layout/build-navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireViewer } from "@/server/auth/session";

/** Authenticated application shell: every route in this group requires an authorized viewer. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  // Same cookie the shadcn sidebar writes when toggled.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <ViewerProvider viewer={viewer}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar sections={buildNavigation(viewer)} />
        <SidebarInset className="bg-background">{children}</SidebarInset>
      </SidebarProvider>
    </ViewerProvider>
  );
}

function ShellFallback() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex min-h-screen">
      <div className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="h-(--app-header-height) bg-brand-ink" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
      <div className="flex-1">
        <div className="h-(--app-header-height) border-b bg-card" />
      </div>
    </div>
  );
}
