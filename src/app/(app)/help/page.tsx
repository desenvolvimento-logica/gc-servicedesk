import type { Metadata } from "next";

import { UpcomingPage } from "@/components/layout/upcoming-page";

export const metadata: Metadata = {
  title: "Ajuda",
};

export default function HelpPage() {
  return <UpcomingPage title="Ajuda" breadcrumbs={[{ label: "Ajuda" }]} />;
}
