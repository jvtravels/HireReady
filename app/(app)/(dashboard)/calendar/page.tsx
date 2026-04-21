import type { Metadata } from "next";
import DashboardCalendar from "@/DashboardCalendar";

export const metadata: Metadata = {
  title: "Calendar | HireStepX",
  description:
    "Schedule and view your upcoming interview practice sessions.",
};

export default function Page() {
  return <DashboardCalendar />;
}
