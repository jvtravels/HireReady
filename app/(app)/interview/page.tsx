import type { Metadata } from "next";
import Interview from "@/Interview";

export const metadata: Metadata = {
  title: "Interview | HireStepX",
  description: "AI-powered mock interview session.",
};

export default function Page() {
  return <Interview />;
}
