import type { Metadata } from "next";
import App from "@/App";

export const metadata: Metadata = {
  title: "HireStepX — AI Mock Interview Practice for Job Seekers",
  description:
    "Practice interviews with AI. Get real-time feedback on communication, structure, and strategy. Land your dream job with HireStepX.",
};

export default function Page() {
  return <App />;
}
