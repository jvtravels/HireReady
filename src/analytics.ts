import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

export const posthogConfigured = !!POSTHOG_KEY;

let initialized = false;

export function initPosthog() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage+cookie",
    loaded: () => {
      // Respect Do Not Track
      if (navigator.doNotTrack === "1") {
        posthog.opt_out_capturing();
      }
    },
  });
  initialized = true;
}

/** Identify a logged-in user — call on login/signup */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (!posthogConfigured) return;
  posthog.identify(userId, properties);
}

/** Reset identity on logout */
export function resetUser() {
  if (!posthogConfigured) return;
  posthog.reset();
}

/** Track a custom event */
export function capture(event: string, properties?: Record<string, unknown>) {
  if (!posthogConfigured) return;
  posthog.capture(event, properties);
}

/** Set user properties (e.g. subscription tier, target company) */
export function setUserProperties(properties: Record<string, unknown>) {
  if (!posthogConfigured) return;
  posthog.people.set(properties);
}
