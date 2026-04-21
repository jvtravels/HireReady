import type { Metadata } from "next";
import DashboardHome from "@/DashboardHome";

export const metadata: Metadata = {
  title: "Dashboard | HireStepX",
  description:
    "Your interview practice dashboard. Track progress and start new sessions.",
};

export default function Page() {
  return <DashboardHome />;
}
