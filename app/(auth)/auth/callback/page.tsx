import type { Metadata } from "next";
import AuthCallback from "@/AuthCallback";

export const metadata: Metadata = {
  title: "Authenticating... | HireStepX",
  description: "Completing sign-in to HireStepX.",
};

export default function Page() {
  return <AuthCallback />;
}
