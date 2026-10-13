import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";

export const metadata: Metadata = {
  title: "Minhas Solicitações",
};

export default function MyRequestsPage() {
  return <UpcomingPage title="Minhas Solicitações" breadcrumbs={[{ label: "Minhas Solicitações" }]} />;
}
