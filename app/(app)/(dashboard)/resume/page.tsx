import type { Metadata } from "next";
import DashboardResume from "@/DashboardResume";

export const metadata: Metadata = {
  title: "Resume | HireStepX",
  description:
    "Upload and manage your resume for personalized interview practice.",
};

export default function Page() {
  return <DashboardResume />;
}
