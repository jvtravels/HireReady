"use client";
import { DashboardProvider } from "@/DashboardContext";
import DashboardLayout from "@/DashboardLayout";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </DashboardProvider>
  );
}
