import type { Metadata } from "next";
import DashboardJobs from "@/DashboardJobs";

export const metadata: Metadata = {
  title: "Jobs | HireStepX",
  description: "See every employer match from the HireStepX talent roster.",
};

export default function Page() {
  return <DashboardJobs />;
}
