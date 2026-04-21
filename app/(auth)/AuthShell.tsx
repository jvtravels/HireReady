"use client";
import { AuthProvider } from "@/AuthContext";
import { ToastProvider } from "@/Toast";

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}
