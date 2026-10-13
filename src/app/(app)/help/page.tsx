import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";
import { requireViewer } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Ajuda",
};

export default function HelpPage() {
  return <UpcomingPage title="Ajuda" breadcrumbs={[{ label: "Ajuda" }]} authorize={requireViewer} />;
}
