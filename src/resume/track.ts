/**
 * Lightweight, privacy-respecting event tracker for resume tab actions.
 *
 * We don't currently have a wired analytics destination (PostHog,
 * Amplitude, etc.) — but we DO want to capture event names + key
 * dimensions in a grep-able shape so we can:
 *   1. Validate which features are getting used in production via
 *      console / log aggregator
 *   2. Wire to a real destination later without changing call sites
 *
 * To enable a real backend, replace the implementation of `track()`
 * — call sites remain stable.
 */

declare const process: { env: Record<string, string | undefined> };

export type ResumeEvent =
  | "resume_uploaded"
  | "resume_make_active"
  | "resume_restore_version"
  | "resume_renamed"
  | "resume_archived"
  | "resume_polish_requested"
  | "resume_polish_applied"
  | "resume_domain_changed";

interface TrackPayload {
  resumeId?: string;
  versionId?: string;
  domain?: string;
  versionNumber?: number;
  fromVersion?: number;
  toVersion?: number;
  // Free-form context — kept small to avoid noise in logs.
  [key: string]: string | number | boolean | undefined;
}

const ENABLED = (() => {
  try {
    return (typeof process !== "undefined" && process.env?.NODE_ENV !== "test");
  } catch { return false; }
})();

export function trackResumeEvent(name: ResumeEvent, payload: TrackPayload = {}): void {
  if (!ENABLED) return;
  // Stable shape: `[track] event_name {json}` — easy to grep in
  // Vercel logs and to redirect into a real ingester later.
  try {
    const safe: TrackPayload = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v == null) continue;
      // Truncate strings to keep log lines bounded
      safe[k] = typeof v === "string" ? v.slice(0, 80) : v;
    }
    console.info(`[track] ${name}`, safe);
    // Future: forward to PostHog / Amplitude here. Single switch:
    // if (window.posthog) window.posthog.capture(name, safe);
  } catch { /* never throw from telemetry */ }
}
