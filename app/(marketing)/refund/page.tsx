import type { Metadata } from "next";
import RefundPolicy from "@/RefundPolicy";

export const metadata: Metadata = {
  title: "Refund Policy | HireStepX",
  description:
    "HireStepX refund policy. Learn about our refund and cancellation terms.",
};

// Static page — CDN cached, revalidated daily in case of policy edits.
export const dynamic = "force-static";
export const revalidate = 86400;

export default function Page() {
  return <RefundPolicy />;
}
