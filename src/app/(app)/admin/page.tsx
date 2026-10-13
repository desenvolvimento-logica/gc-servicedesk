import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";
import { requireAdministrator } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Configurações",
};

export default function AdminPage() {
  return <UpcomingPage title="Configurações" breadcrumbs={[{ label: "Administração" }, { label: "Configurações" }]} authorize={requireAdministrator} />;
}
