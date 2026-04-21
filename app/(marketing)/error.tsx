"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: 32, fontFamily: "var(--font-ui, system-ui, sans-serif)" }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: "#e5e5e5", marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: "#a3a3a3", marginBottom: 24 }}>{error.message || "An unexpected error occurred."}</p>
      <button
        onClick={reset}
        style={{ padding: "10px 24px", fontSize: 14, fontWeight: 500, color: "#0a0a0a", background: "#22c55e", border: "none", borderRadius: 8, cursor: "pointer" }}
      >
        Try again
      </button>
    </div>
  );
}
