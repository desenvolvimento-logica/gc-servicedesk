import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";
import { requireStaff } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Relatórios",
};

export default function ReportsPage() {
  return <UpcomingPage title="Relatórios" breadcrumbs={[{ label: "Relatórios" }]} authorize={requireStaff} />;
}
