import type { Metadata } from "next";
import SharedReportView from "@/SharedReportView";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata: Metadata = {
  title: "Interview Report | HireStepX",
  description: "Mock interview performance report shared from HireStepX.",
  robots: { index: false, follow: false }, // public link but not indexable
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedReportView token={token} />;
}
