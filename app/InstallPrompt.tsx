"use client";

import { useEffect, useState } from "react";

/**
 * PWA install prompt surface. Chrome/Edge/Samsung Internet fire
 * `beforeinstallprompt` when the app meets installability criteria
 * (manifest, HTTPS, service worker, visited twice). We intercept, stash
 * the event, and render a subtle bottom-sheet CTA that the user can
 * trigger when they're ready.
 *
 * iOS Safari doesn't fire beforeinstallprompt — for iOS we'd need a
 * custom "Add to Home Screen" explainer with the share icon, which is
 * a separate UX. This component is Android/Chrome desktop only.
 *
 * Dismissal is persisted to localStorage so we don't nag users who
 * said no. Re-shows if localStorage is cleared or after 30 days.
 */

const STORAGE_KEY = "hirestepx_install_prompt_state";
const DISMISS_WINDOW_DAYS = 30;

interface StashedPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function shouldShowPrompt(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const { dismissedAt } = JSON.parse(raw) as { dismissedAt?: string };
    if (!dismissedAt) return true;
    const daysSince = (Date.now() - new Date(dismissedAt).getTime()) / 86_400_000;
    return daysSince > DISMISS_WINDOW_DAYS;
  } catch { return true; }
}

function recordDismissal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissedAt: new Date().toISOString() }));
  } catch { /* restricted storage */ }
}

export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<StashedPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed? Chrome exposes this via matchMedia.
    if (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) {
      return;
    }
    if (!shouldShowPrompt()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // lets us trigger the native prompt later
      setPromptEvent(e as StashedPromptEvent);
      // Delay surfacing the CTA by 10s so we don't ambush first-time users.
      setTimeout(() => setVisible(true), 10_000);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // If the app gets installed in-session (user accepted via browser menu),
    // hide the banner immediately.
    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible || !promptEvent) return null;

  const onInstall = async () => {
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "dismissed") recordDismissal();
      setVisible(false);
      setPromptEvent(null);
    } catch {
      setVisible(false);
    }
  };

  const onDismiss = () => {
    recordDismissal();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install HireStepX to your home screen"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        // Sit above the iOS home indicator.
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 9999,
        background: "#111113",
        border: "1px solid rgba(212,179,127,0.2)",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "'Inter', system-ui, sans-serif",
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4B37F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#F5F2ED" }}>
          Install HireStepX
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9A9590", lineHeight: 1.4 }}>
          Practice offline, launch from your home screen.
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss install prompt"
        style={{
          background: "transparent",
          border: "none",
          color: "#9A9590",
          fontSize: 13,
          padding: "8px 10px",
          cursor: "pointer",
          minWidth: 44,
          minHeight: 44,
        }}
      >Not now</button>
      <button
        onClick={onInstall}
        style={{
          background: "linear-gradient(135deg, #D4B37F, #B89968)",
          border: "none",
          color: "#060607",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 18px",
          borderRadius: 8,
          cursor: "pointer",
          minHeight: 44,
        }}
      >Install</button>
    </div>
  );
}
