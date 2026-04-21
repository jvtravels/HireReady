import type { Metadata } from "next";
import OnboardingComplete from "@/OnboardingComplete";

export const metadata: Metadata = {
  title: "Setup Complete | HireStepX",
  description: "Your HireStepX profile is ready.",
};

export default function Page() {
  return <OnboardingComplete />;
}
