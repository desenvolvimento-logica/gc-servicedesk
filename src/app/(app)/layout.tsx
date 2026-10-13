import { AppSidebar } from "@/components/layout/app-sidebar";
import { requesterNavigation } from "@/components/layout/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Authenticated application shell. Route protection and role-based
 * navigation are added in Phase 2 (Microsoft Entra ID SSO).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar items={requesterNavigation} />
      <SidebarInset className="bg-background">{children}</SidebarInset>
    </SidebarProvider>
  );
}
