import type { Metadata } from "next";
import DashboardSettings from "@/DashboardSettings";

export const metadata: Metadata = {
  title: "Settings | HireStepX",
  description: "Manage your HireStepX account settings.",
};

export default function Page() {
  return <DashboardSettings />;
}
