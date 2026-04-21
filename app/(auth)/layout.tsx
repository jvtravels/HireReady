"use client";
import dynamic from "next/dynamic";

const AuthShell = dynamic(() => import("./AuthShell"), { ssr: false });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
