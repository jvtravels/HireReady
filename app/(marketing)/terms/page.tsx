import type { Metadata } from "next";
import TermsOfService from "@/TermsOfService";

export const metadata: Metadata = {
  title: "Terms of Service | HireStepX",
  description:
    "HireStepX terms of service. Read our terms and conditions for using the platform.",
};

export default function Page() {
  return <TermsOfService />;
}
