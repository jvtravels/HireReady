import type { Metadata } from "next";
import SignUp from "@/SignUp";

export const metadata: Metadata = {
  title: "Sign Up | HireStepX",
  description:
    "Create your free HireStepX account and start practicing interviews today.",
};

export default function Page() {
  return <SignUp />;
}
