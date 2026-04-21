import type { Metadata } from "next";
import DashboardSessions from "@/DashboardSessions";

export const metadata: Metadata = {
  title: "Sessions | HireStepX",
  description:
    "View your past interview practice sessions and feedback.",
};

export default function Page() {
  return <DashboardSessions />;
}
