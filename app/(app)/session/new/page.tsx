import type { Metadata } from "next";
import SessionSetup from "@/SessionSetup";

export const metadata: Metadata = {
  title: "New Session | HireStepX",
  description:
    "Configure and start a new interview practice session.",
};

export default function Page() {
  return <SessionSetup />;
}
