"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "hirestepx_cookie_consent";

/** Emits a custom event so analytics code can lazy-load after consent. */
function broadcast(accepted: boolean) {
  try {
    window.dispatchEvent(new CustomEvent("hirestepx:cookie-consent", { detail: { accepted } }));
  } catch { /* noop */ }
}

export function getCookieConsent(): "accepted" | "rejected" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch { /* noop */ }
  return null;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = getCookieConsent();
    if (existing) return;
    // Delay slightly so first paint isn't blocked by the banner
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  const setConsent = (accepted: boolean) => {
    try { localStorage.setItem(CONSENT_KEY, accepted ? "accepted" : "rejected"); } catch { /* noop */ }
    broadcast(accepted);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-describedby="cookie-consent-desc"
      style={{
        position: "fixed",
        bottom: 20, left: 20, right: 20,
        maxWidth: 640, marginLeft: "auto", marginRight: "auto",
        zIndex: 9999,
        background: "rgba(20,20,22,0.96)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(245,242,237,0.12)",
        borderRadius: 14,
        padding: "18px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        color: "#F5F2ED",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div id="cookie-consent-desc" style={{ flex: "1 1 260px", fontSize: 13, lineHeight: 1.55, color: "#D1CDC6" }}>
        We use essential cookies to run HireStepX. With your permission we'll also use
        analytics cookies to improve the experience.{" "}
        <a href="/privacy" style={{ color: "#D4B37F", textDecoration: "underline" }}>
          Privacy policy
        </a>
        .
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setConsent(false)}
          style={{
            fontFamily: "inherit", fontSize: 13, fontWeight: 500,
            color: "#D1CDC6",
            background: "transparent",
            border: "1px solid rgba(245,242,237,0.18)",
            borderRadius: 8, padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => setConsent(true)}
          style={{
            fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            color: "#060607",
            background: "#D4B37F",
            border: "1px solid #D4B37F",
            borderRadius: 8, padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
