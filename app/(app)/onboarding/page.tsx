import type { Metadata } from "next";
import Onboarding from "@/Onboarding";

export const metadata: Metadata = {
  title: "Get Started | HireStepX",
  description: "Set up your profile for personalized interview practice.",
};

export default function Page() {
  return <Onboarding />;
}
