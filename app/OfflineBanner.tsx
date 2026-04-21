"use client";

import { useEffect, useState } from "react";

/**
 * Shows a fixed banner when the user goes offline, and a brief
 * "Back online" confirmation when connectivity is restored.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    // Sync initial state (SSR always assumes online)
    setOnline(navigator.onLine);

    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      setShowBackOnline(true);
      const t = setTimeout(() => setShowBackOnline(false), 2000);
      return () => clearTimeout(t);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (online && !showBackOnline) return null;

  const isBack = online && showBackOnline;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: isBack
          ? "rgba(34,120,60,0.92)"
          : "rgba(212,179,127,0.14)",
        borderBottom: isBack
          ? "1px solid #2d8a4e"
          : "1px solid #D4B37F",
        color: isBack ? "#e0f5e6" : "#D4B37F",
        textAlign: "center",
        padding: "8px 16px",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
        transition: "opacity 0.4s ease",
        opacity: isBack ? 0.95 : 1,
      }}
    >
      {isBack
        ? "Back online"
        : "You\u2019re offline. Some features may not work."}
    </div>
  );
}
