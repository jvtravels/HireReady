import type { Metadata } from "next";
import SessionDetail from "@/SessionDetail";

export const metadata: Metadata = {
  title: "Session Details | HireStepX",
  description:
    "View detailed feedback from your interview practice session.",
};

export default function Page() {
  return <SessionDetail />;
}
