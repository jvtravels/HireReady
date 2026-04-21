"use client";
import { AuthProvider, RequireAuth } from "@/AuthContext";
import { ToastProvider } from "@/Toast";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <RequireAuth>
          {children}
        </RequireAuth>
      </ToastProvider>
    </AuthProvider>
  );
}
