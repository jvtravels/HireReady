"use client";
import dynamic from "next/dynamic";

const MarketingShell = dynamic(() => import("./MarketingShell"), { ssr: false });

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
