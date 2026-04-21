import type { Metadata } from "next";
import DashboardAnalytics from "@/DashboardAnalytics";

export const metadata: Metadata = {
  title: "Analytics | HireStepX",
  description:
    "Track your interview practice performance and improvement over time.",
};

export default function Page() {
  return <DashboardAnalytics />;
}
