"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getCookieConsent } from "./CookieConsent";

export default function ConsentGatedAnalytics() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    // Read current consent on mount
    setAccepted(getCookieConsent() === "accepted");

    // Listen for consent changes from the banner
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ accepted: boolean }>).detail;
      setAccepted(!!detail?.accepted);
    };
    window.addEventListener("hirestepx:cookie-consent", handler);
    return () => window.removeEventListener("hirestepx:cookie-consent", handler);
  }, []);

  if (!accepted) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
