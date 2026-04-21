import type { Metadata } from "next";
import PrivacyPolicy from "@/PrivacyPolicy";

export const metadata: Metadata = {
  title: "Privacy Policy | HireStepX",
  description:
    "HireStepX privacy policy. Learn how we collect, use, and protect your data.",
};

export default function Page() {
  return <PrivacyPolicy />;
}
