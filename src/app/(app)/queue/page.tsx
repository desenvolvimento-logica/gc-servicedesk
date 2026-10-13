import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";
import { requireStaff } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Fila de Atendimento",
};

export default function QueuePage() {
  return <UpcomingPage title="Fila de Atendimento" breadcrumbs={[{ label: "Fila de Atendimento" }]} authorize={requireStaff} />;
}
