import { redirect } from "next/navigation";

/** The administration area starts at the service catalog. */
export default function AdminPage() {
  redirect("/admin/services");
}
