import type { Metadata } from "next";
import RefundPolicy from "@/RefundPolicy";

export const metadata: Metadata = {
  title: "Refund Policy | HireStepX",
  description:
    "HireStepX refund policy. Learn about our refund and cancellation terms.",
};

export default function Page() {
  return <RefundPolicy />;
}
