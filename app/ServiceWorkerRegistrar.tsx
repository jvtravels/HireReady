"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production for offline resilience.
 * Extracted as a client component so the root layout stays a server component.
 *
 * Deferred until after LCP (requestIdleCallback / 2s fallback) — the SW
 * registration triggers a fetch for /sw.js, which competes with critical
 * navigation resources if it runs immediately on mount.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(err => {
        if (typeof console !== "undefined") console.warn("[sw] registration failed:", err?.message || err);
      });
    };
    type IdleCallbackFn = (cb: () => void, opts?: { timeout: number }) => number;
    const idle = (window as unknown as { requestIdleCallback?: IdleCallbackFn }).requestIdleCallback;
    if (typeof idle === "function") {
      idle(register, { timeout: 3000 });
      return;
    }
    // Safari + older browsers — defer 2s so we land well after LCP
    const t = setTimeout(register, 2000);
    return () => clearTimeout(t);
  }, []);

  return null;
}
