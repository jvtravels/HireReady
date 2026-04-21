"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production for offline resilience.
 * Extracted as a client component so the root layout stays a server component.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
