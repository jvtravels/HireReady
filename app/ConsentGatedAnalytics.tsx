"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getCookieConsent } from "./CookieConsent";

// Dynamically imported only when user accepts — keeps ~20KB out of the default bundle
const Analytics = dynamic(() => import("@vercel/analytics/next").then(m => m.Analytics), { ssr: false });
const SpeedInsights = dynamic(() => import("@vercel/speed-insights/next").then(m => m.SpeedInsights), { ssr: false });

export default function ConsentGatedAnalytics() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(getCookieConsent() === "accepted");
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
