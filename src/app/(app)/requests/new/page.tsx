import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";
import { requireRequestOpener } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Nova Solicitação",
};

export default function NewRequestPage() {
  return <UpcomingPage title="Nova Solicitação" breadcrumbs={[{ label: "Solicitações", href: "/requests" }, { label: "Nova Solicitação" }]} authorize={requireRequestOpener} />;
}
